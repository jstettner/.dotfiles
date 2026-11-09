import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { loadSkills } from '/Users/jackstettner/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js';

const root = join(homedir(), '.pi/agent/skills');
const expected = [
  'init-task', 'show-me', 'ci-commit', 'describe-pr', 'setup-worktree',
  'create-research-questions', 'create-research', 'create-design-discussion',
  'create-prd', 'create-tdd', 'create-structure-outline', 'create-plan',
  'implement-plan', 'implement-outline', 'iterate-research-questions',
  'iterate-research', 'iterate-design-discussion', 'iterate-prd',
  'iterate-tdd', 'iterate-structure-outline', 'iterate-plan', 'iterate-implementation',
].sort();
const loaded = loadSkills({
  cwd: homedir(), agentDir: join(homedir(), '.pi/agent'), includeDefaults: true,
  skillPaths: [],
});
assert.deepEqual(loaded.diagnostics, [], 'Pi skill loader diagnostics');
assert.deepEqual(loaded.skills.filter(s => s.filePath.startsWith(root + '/')).map(s => s.name).sort(), expected);
let references = 0;
let commands = 0;
for (const name of expected) {
  const base = join(root, name);
  const skill = loaded.skills.find(s => s.name === name);
  assert.equal(skill.filePath, join(base, 'SKILL.md'));
  assert.equal(skill.disableModelInvocation, true);
  assert(existsSync(join(base, 'LICENSE')));
  const files = [join(base, 'SKILL.md'), ...readdirSync(join(base, 'references'))
    .filter(f => f.endsWith('.md')).map(f => join(base, 'references', f))];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert(!/\.humanlayer|\/rpi:|\{SKILLBASE\}|task-artifact|Agent\(|subagent_type|TodoWrite|workspace\.json|additionalContext/.test(text), file);
    for (const match of text.matchAll(/\/skill:([a-z][a-z0-9-]*)/g)) {
      assert(expected.includes(match[1]), `${file}: unknown command ${match[0]}`);
      commands++;
    }
    // Skill instructions have resolvable reference links; artifact templates intentionally
    // contain example links to files that will be produced during actual task execution.
    if (file.endsWith('/SKILL.md')) {
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const path = match[1];
        if (/^https?:/.test(path)) continue;
        assert(existsSync(resolve(base, path)), `${file}: broken reference ${path}`);
        references++;
      }
    }
  }
}
const settings = JSON.parse(readFileSync(join(homedir(), '.pi/agent/settings.json'), 'utf8'));
assert.notEqual(settings.enableSkillCommands, false, 'Native skill commands are disabled');
const projectDiscovery = loadSkills({
  cwd: process.cwd(), agentDir: join(homedir(), '.pi/agent'), includeDefaults: true,
  skillPaths: [join(homedir(), '.agents/skills'), join(process.cwd(), '.agents/skills')]
    .filter(existsSync),
});
for (const name of expected) {
  assert.equal(projectDiscovery.skills.find(s => s.name === name)?.filePath, join(root, name, 'SKILL.md'));
}
console.log(JSON.stringify({ skillCount: expected.length, diagnostics: loaded.diagnostics,
  projectDiagnostics: projectDiscovery.diagnostics,
  referenceLinksChecked: references, commandReferencesChecked: commands,
  commands: expected.map(name => `/skill:${name}`) }, null, 2));
