-- Teleport: move a Rex session, the git worktree its focused pane is in, and the pi sessions running in it, between
-- this Mac and a host. It's a handoff: the session is rebuilt on the other machine, pane for pane, then closed here,
-- unless it's this Mac's and keep_local is set.
--
-- One end is always this Mac, and it drives both. teleport/teleport.sh does each machine's part: it bundles a
-- snapshot of the worktree (HEAD, the index, and the working tree with untracked files), and the other end checks it
-- out at the same place under ~, stashing or branching off anything there it would overwrite. Files move by rsync
-- over ssh, from this Mac, since a host can't reach it. Gitignored files travel only when the repo's carry list
-- names them. Each pi pane continues with `pi --fork` from a copy of its session file, which the pi extension
-- (~/.pi/agent/extensions/teleport.ts) records.
--
-- A host runs teleport.sh through its own Rex (teleport_helper), since only the logged-in session there can read the
-- keychain git needs. So a host loads this file too, with no hosts of its own.
local M = {}

local home = os.getenv("HOME")
local helper = home .. "/.config/rex/teleport/teleport.sh"
-- Actions run with Rex's bare environment, where rex isn't on PATH.
local rex_bin = home
  .. "/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex"
local cache = ".cache/rex-teleport/"
local unpack = table.unpack or unpack
local shells = { zsh = true, bash = true, fish = true, sh = true, dash = true, nu = true }
local ssh_opts = "ssh -o BatchMode=yes"

-- hosts: label -> { ssh = destination }, defaulting the destination to the label.
-- repos: main checkout's path under ~ -> { carry = { gitignored paths }, setup = command for the focused pane }.
-- keep_local: leave this Mac's session open after teleporting it to a host.
local config = { hosts = {}, repos = {}, keep_local = false }

local function read(path)
  local f = assert(io.open(path))
  local text = f:read("*a")
  f:close()
  return text
end

local function quote(s)
  return "'" .. s:gsub("'", "'\\''") .. "'"
end

local function check(res, what)
  if not res.ok then
    local out = res.stderr ~= "" and res.stderr or res.stdout
    error(what .. ": " .. out:gsub("%s+$", ""), 0)
  end
  return res.stdout
end

local function run(argv, opts)
  local res, err = rex.exec(argv, opts)
  if not res then
    error(argv[1] .. ": " .. err, 0)
  end
  return check(res, argv[1])
end

-- teleport.sh prints KEY=VALUE lines. The last value of each key is t[key]; t.all[key] lists them all.
local function parse(out)
  local t = { all = {} }
  for key, value in out:gmatch("([%w_]+)=([^\n]*)") do
    t[key] = value
    t.all[key] = t.all[key] or {}
    table.insert(t.all[key], value)
  end
  return t
end

-- A machine's Rex API (this Mac's when label is nil), through the rex CLI. rex.server only reaches hosts the
-- request lists, which the CLI's don't, so it would fail for /teleport; and an action's own connection is attached
-- only to its session, while the CLI attaches to whichever session a call names.
local function api_of(label)
  local argv = { rex_bin }
  if label then
    table.insert(argv, "-S")
    table.insert(argv, label)
  end
  table.insert(argv, "--timeout")
  table.insert(argv, "10m")
  return {
    call = function(method, args)
      local command = { unpack(argv) }
      for _, word in ipairs({ "api", "call", method, "-" }) do
        table.insert(command, word)
      end
      local res, err = rex.exec(command, { stdin = rex.json.encode(args) })
      if not res then
        return nil, err
      end
      if not res.ok then
        return nil, (res.stderr:gsub("^Error: ", ""):gsub("%s+$", ""))
      end
      return rex.json.decode(res.stdout)
    end,
  }
end

-- One end of a teleport: this Mac (label nil) or a host. path() names a file under ~ there for rsync.
local function side(label)
  if not label then
    return {
      name = "this Mac",
      api = api_of(nil),
      path = function(rel)
        return home .. "/" .. rel
      end,
      helper = function(...)
        return parse(run({ "bash", helper, ... }))
      end,
    }
  end
  local host = config.hosts[label] or error("no teleport host " .. label .. "; add it to hosts in init.lua", 0)
  local ssh = host.ssh or label
  local api = api_of(label)
  return {
    name = label,
    ssh = ssh,
    api = api,
    path = function(rel)
      return ssh .. ":" .. rel
    end,
    helper = function(...)
      local argv = { ... }
      local res, err = api.call("client.action", {
        action = "teleport_helper",
        args = { argv = argv, script = read(helper) },
      })
      if not res then
        error(label .. ": teleport.sh " .. argv[1] .. ": " .. tostring(err), 0)
      end
      return parse(check(res.result, label .. ": teleport.sh " .. argv[1]))
    end,
  }
end

local function rsync(from, to, opts)
  return run({ "rsync", "-a", "-e", ssh_opts, from, to }, opts)
end

local function call(s, method, args)
  local res, err = s.api.call(method, args)
  if not res then
    error(s.name .. ": " .. method .. ": " .. tostring(err), 0)
  end
  return res
end

-- What each terminal is running and where, from its foreground process.
local function inspect_panes(src, session_id, view)
  local panes = {}
  for _, window in ipairs(view.windows) do
    for _, layer in ipairs(window.layers) do
      for _, block in ipairs(layer.blocks) do
        local pane = { block = block }
        if block.creator_name == "com.superlogical.terminal" then
          local proc = call(src, "block.method", { session_id = session_id, block_id = block.block_id, method = "process" })
          local fg = proc.foreground or proc.child
          if fg then
            pane.cwd, pane.pid, pane.program = fg.cwd, fg.pid, fg.argv0 or fg.name
            pane.shell = shells[fg.name] or false
          else
            pane.shell = true
          end
        end
        panes[block.block_id] = pane
      end
    end
  end

  local pids = {}
  for _, pane in pairs(panes) do
    if pane.shell == false then
      table.insert(pids, tostring(pane.pid))
    end
  end
  if #pids > 0 then
    local found = {}
    local listed = src.helper("panes", unpack(pids))
    for _, line in ipairs(listed.all.pi or {}) do
      local pid, json = line:match("^(%d+) (.*)$")
      found[tonumber(pid)] = rex.json.decode(json)
    end
    -- A pi with nothing said yet has no session file to carry; it starts afresh.
    for _, line in ipairs(listed.all.fresh or {}) do
      local pid, json = line:match("^(%d+) (.*)$")
      found[tonumber(pid)] = { busy = rex.json.decode(json).busy, fresh = true }
    end
    for _, pane in pairs(panes) do
      pane.pi = pane.pid and found[pane.pid]
    end
  end
  return panes
end

-- A path under the source worktree or ~, as a path under ~ on the other machine.
local function relocate(path, top, rel, from_home)
  if not path then
    return nil
  end
  if path == top then
    return rel
  end
  if path:sub(1, #top + 1) == top .. "/" then
    return rel .. path:sub(#top + 1)
  end
  if path:sub(1, #from_home + 1) == from_home .. "/" then
    return path:sub(#from_home + 2)
  end
  return nil
end

-- A window's layout for session.create, recording its blocks in the order the result lists the new ones.
local function build(node, panes, order)
  if node.split then
    local s = node.split
    return {
      split = {
        direction = s.direction,
        ratio = s.ratio,
        before = build(s.before, panes, order),
        after = build(s.after, panes, order),
      },
    }
  end
  local pane = panes[node.block_id]
  table.insert(order, node.block_id)
  local block = { flavor = pane.block.flavor, options = pane.options }
  if pane.block.label and pane.block.label ~= "shell" then
    block.label = pane.block.label
  end
  return { block = block }
end

-- Setup (bun install, say) can take minutes in a new worktree, so it runs in a shell beside pi rather than before
-- it: the focused pane unless that's a pi, or else a shell in its window, or else any shell. Only with no shell
-- does it go before pi.
local function pick_setup_pane(view, panes, focused)
  if not panes[focused].pi then
    return focused
  end
  local beside, anywhere
  for _, window in ipairs(view.windows) do
    local here = false
    for _, layer in ipairs(window.layers) do
      for _, block in ipairs(layer.blocks) do
        here = here or block.block_id == focused
      end
    end
    for _, layer in ipairs(window.layers) do
      for _, block in ipairs(layer.blocks) do
        if panes[block.block_id].shell then
          anywhere = anywhere or block.block_id
          if here then
            beside = beside or block.block_id
          end
        end
      end
    end
  end
  return beside or anywhere or focused
end

local function only_host()
  local labels = {}
  for label in pairs(config.hosts) do
    table.insert(labels, label)
  end
  if #labels ~= 1 then
    error("say which host to teleport to: to=" .. table.concat(labels, "|"), 0)
  end
  return labels[1]
end

local function teleport(ctx, args)
  local from = args.from or ctx.server
  if from == "local" then
    from = nil
  end
  local to = args.to or (from and "local" or only_host())
  if to == "local" then
    to = nil
  end
  if (from == nil) == (to == nil) then
    error("teleport moves a session between this Mac and a host", 0)
  end
  local session_id = args.session or ctx.session_id
  local block_id = args.block or ctx.block_id
  if not session_id or not block_id then
    error("teleport needs a focused pane", 0)
  end

  local src, dst = side(from), side(to)
  local view = call(src, "session.view", { session_id = session_id })
  local panes = inspect_panes(src, session_id, view)
  local base = panes[block_id]
  if not base or not base.cwd then
    error("the focused pane isn't a terminal in a folder", 0)
  end
  for _, pane in pairs(panes) do
    if pane.pi and pane.pi.busy then
      error("a pi in this session is working; let it finish or stop it first", 0)
    end
    if pane.shell == false and not pane.pi and pane.program == "pi" then
      error("a pi in this session hasn't told teleport its session: it started before the extension did, so "
        .. "restart it with pi -c, or it's waiting at a prompt such as trusting the folder", 0)
    end
    if pane.shell == false and not pane.pi and not args.force then
      error("a pane is running " .. pane.program .. "; quit it first, or pass force=true to drop it", 0)
    end
  end

  local info = src.helper("info", base.cwd)
  local repo = config.repos[info.repo] or {}
  local to_home = dst.helper("hello").home
  local from_home = src.helper("hello").home
  math.randomseed(os.time())
  local id = os.date("!%Y%m%d%H%M%S") .. "-" .. math.random(1000, 9999)
  local bundle = cache .. id .. ".bundle"

  local packed = src.helper("pack", info.top, id, from_home .. "/" .. bundle, unpack(repo.carry or {}))
  rsync(src.path(bundle), dst.path(bundle))
  if src.ssh then
    run({ "ssh", "-o", "BatchMode=yes", src.ssh, "rm -f " .. quote(bundle) })
  else
    os.remove(home .. "/" .. bundle)
  end
  local unpacked = dst.helper("unpack", info.repo, info.worktree, id, info.branch, to_home .. "/" .. bundle)
  local worktree = to_home .. "/" .. info.worktree

  -- Each into its parent, which the checkout made. macOS's openrsync ignores -R's /./ marker.
  for _, path in ipairs(packed.all.carry or {}) do
    path = path:gsub("/+$", "")
    local parent = path:match("^(.*)/[^/]+$")
    local into = info.worktree .. "/" .. (parent and parent .. "/" or "")
    rsync(src.path(info.worktree .. "/" .. path), dst.path(into))
  end

  -- Where each pane opens, falling back to the worktree when its folder isn't on the other machine.
  local wanted = {}
  for _, pane in pairs(panes) do
    local rel = relocate(pane.cwd, info.top, info.worktree, from_home)
    pane.target = rel and (to_home .. "/" .. rel)
    if pane.target then
      table.insert(wanted, pane.target)
    end
  end
  local exists = {}
  for _, path in ipairs(dst.helper("dirs", unpack(wanted)).all.dir or {}) do
    exists[path] = true
  end

  local setup_pane = repo.setup and pick_setup_pane(view, panes, block_id)
  local n = 0
  for pane_id, pane in pairs(panes) do
    local input = {}
    if pane_id == setup_pane then
      table.insert(input, "(cd " .. quote(worktree) .. " && " .. repo.setup .. ")")
    end
    if pane.pi and pane.pi.fresh then
      table.insert(input, "pi")
    elseif pane.pi then
      n = n + 1
      local copy = cache .. id .. "-" .. n .. ".jsonl"
      rsync(src.ssh and (src.ssh .. ":" .. pane.pi.file) or pane.pi.file, dst.path(copy))
      table.insert(input, "pi --fork " .. quote(to_home .. "/" .. copy))
    end
    pane.options = { cwd = exists[pane.target] and pane.target or worktree }
    if #input > 0 then
      pane.options.initial_input = table.concat(input, "; ") .. "\n"
    end
  end

  -- The same windows and splits. Floating layers aren't rebuilt.
  local windows, orders, active = {}, {}, nil
  for _, window in ipairs(view.windows) do
    for _, layer in ipairs(window.layers) do
      if layer.kind == "tiled" then
        local order = {}
        local w = { layout = build(layer.layout, panes, order) }
        if window.label and not window.label:match("^Window %x+$") then
          w.window_label = window.label
        end
        table.insert(windows, w)
        orders[#windows] = order
        if window.window_id == view.active_window_id then
          active = #windows
        end
        break
      end
    end
  end

  local created, create_err = dst.api.call("session.create", { label = view.label, initial_windows = windows })
  if not created then
    rex.log("warn", "teleport: couldn't keep the label " .. tostring(view.label) .. ": " .. tostring(create_err))
    created = call(dst, "session.create", { initial_windows = windows })
  end
  local new_session = created.session_id

  -- Focus the pane that was focused, or failing that, the window that was active.
  local focus
  for i, order in ipairs(orders) do
    for j, old in ipairs(order) do
      if old == block_id then
        focus = created.initial_windows[i].block_ids[j]
      end
    end
  end
  if focus then
    dst.api.call("session.focus_block", { session_id = new_session, block_id = focus })
  elseif active then
    dst.api.call("session.focus_window", {
      session_id = new_session,
      window_id = created.initial_windows[active].window_id,
    })
  end

  -- The app that asked follows to the new session. With follow, so does every app attached to the old one, which
  -- is every app connected to its server, so /teleport, run from the pane someone is looking at, passes it.
  if ctx.origin == "key" or ctx.origin == "palette" then
    pcall(rex.client.queue, "session.select", { session_id = new_session })
  end
  if args.follow then
    local clients = src.api.call("session.list_clients", { session_id = session_id })
    for _, client in ipairs(clients and clients.clients or {}) do
      if client.info and client.info.kind == "app" then
        src.api.call("client.perform", {
          client_id = client.client_id,
          action = "session.select",
          args = { session_id = new_session },
        })
      end
    end
  end
  local kept = from == nil and config.keep_local
  if not kept then
    call(src, "session.destroy", { session_id = session_id })
  end

  return {
    session_id = new_session,
    host = to or "local",
    worktree = worktree,
    kept = kept or nil,
    notes = unpacked.all.note,
  }
end

-- Runs teleport.sh, sent by the Mac driving a teleport, on this machine.
local function helper_action(_, args)
  local res, err = rex.exec({ "bash", "-s", "--", unpack(args.argv) }, { stdin = args.script })
  if not res then
    error("teleport.sh: " .. err, 0)
  end
  return { ok = res.ok, stdout = res.stdout, stderr = res.stderr }
end

function M.setup(opts)
  config.hosts = opts.hosts or {}
  config.repos = opts.repos or {}
  config.keep_local = opts.keep_local or false
  rex.action({
    name = "teleport",
    title = "Teleport Session",
    description = "Move this session, its worktree and its pi sessions between this Mac and a host",
    category = "Session",
    keywords = "teleport move handoff remote host worktree",
    args = {
      to = "string?",
      from = "string?",
      session = "string?",
      block = "string?",
      force = "boolean?",
      follow = "boolean?",
    },
    run = teleport,
  })
  rex.action({
    name = "teleport_helper",
    title = "Teleport: run this machine's part",
    category = "Session",
    args = { argv = "array", script = "string" },
    run = helper_action,
  })
end

return M
