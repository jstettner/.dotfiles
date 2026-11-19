import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";
import { destructiveRemoval, wholeDiskScan } from "./rules.ts";

const home = homedir();

test("blocks searches of the whole disk, the home directory or a top-level directory", () => {
	const blocked = [
		`find / -maxdepth 6 -type d -path "*node_modules/@effect/sql" 2>/dev/null | head`,
		"ls node_modules/effect/dist | head -3; find / -name package.json",
		"find ~ -name '*.ts'",
		"find $HOME -type f",
		`find ${home}/ -name x`,
		"sudo find /Users -name foo",
		"rg -l 'SqlClient' /",
		"fd sql ~/",
		"grep -rn foo /Library",
		"cd /tmp && du -sh /",
		"ls -laR /",
		"echo $(find / -name foo)",
		"FOO=1 find '/' -name foo",
	];
	for (const command of blocked) assert.ok(wholeDiskScan(command), command);
});

test("allows searches of a project or a shallow listing", () => {
	const allowed = [
		"find . -path '*node_modules/@effect/sql'",
		`find ${home}/src/ambral -name '*.ts'`,
		"find / -maxdepth 1 -type d",
		"rg SqlClient packages/",
		"grep -n foo /etc/hosts",
		"ls -la /",
		"ls ~",
		"du -sh ~/src/project",
		"node -p \"require.resolve('effect/package.json')\"",
	];
	for (const command of allowed) assert.equal(wholeDiskScan(command), undefined, command);
});

test("blocks recursive deletion of the root, a top-level directory, home or one of its directories", () => {
	const blocked = [
		"rm -rf /",
		"rm -rf /*",
		"sudo rm -rf / ",
		"rm -fr ~",
		"rm -Rf ~/",
		"rm -rf ~/*",
		'rm -rf "$HOME"',
		"rm -rf ${HOME}/*",
		`rm -rf ${home}`,
		"rm -rf ~/src",
		"rm -rf ~/.ssh",
		`rm -r ${home}/Documents/`,
		"rm --recursive --force /Users",
		"rm -rf /usr",
		"rm --no-preserve-root -rf /tmp/x",
		"cd /tmp && rm -rf build ~",
		"echo y | xargs rm -rf /",
	];
	for (const command of blocked) assert.ok(destructiveRemoval(command), command);
});

test("allows deleting specific files and directories", () => {
	const allowed = [
		"rm -rf node_modules",
		"rm -rf ./dist build",
		"rm -rf /tmp/serialsim",
		"rm -rf ~/src/project/dist",
		`rm -rf ${home}/.cache/pi`,
		"rm -f ~/notes.txt.bak",
		"rm ~/foo",
		"rm -rf $TMPDIR/scratch",
		"git rm -r --cached src",
		"echo 'rm -rf /' > notes.txt",
	];
	for (const command of allowed) assert.equal(destructiveRemoval(command), undefined, command);
});
