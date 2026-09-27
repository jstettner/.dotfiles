# Put tools from the install hook on PATH; chezmoi's environment may predate them.
export PATH="$HOME/.local/bin:$PATH"
if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
export NVM_DIR="$HOME/.nvm"
# Sourced before set -eu, which nvm.sh does not support.
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi
