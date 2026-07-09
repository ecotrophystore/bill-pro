const fs = require('fs');
const path = require('path');

const brainDir = 'C:\Users\sathi\.gemini\antigravity-ide\brain';
const folders = fs.readdirSync(brainDir);

const workspaceRoot = 'c:\Users\sathi\Downloads\bill-pro-main\bill-pro-main';
const oldRoot1 = 'c:\Users\sathi\Downloads\Bill Pro-20260612T095528Z-3-001\Bill Pro';
const oldRoot2 = 'c:\Users\sathi\Downloads\bill-pro-main\bill-pro-main';

let fileContents = {}; // normalized relative path -> code content

folders.forEach(folder => {
  // Use transcript_full.jsonl to get full, untruncated contents
  const transcriptPath = path.join(brainDir, folder, '.system_generated', 'logs', 'transcript_full.jsonl');
  if (!fs.existsSync(transcriptPath)) return;

  console.log(`Reading full transcript for ${folder}...`);
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('
');
  lines.forEach(line => {
    try {
      const obj = JSON.parse(line);
      if (obj.tool_calls) {
        obj.tool_calls.forEach(tc => {
          const name = tc.name || '';
          if (name.includes('write_to_file')) {
            const args = tc.args || tc.arguments || {};
            let filePath = args.TargetFile || args.targetFile || '';
            let code = args.CodeContent || args.codeContent || '';
            if (!filePath || !code) return;

            // Strip double quotes
            filePath = filePath.trim().replace(/^"+|"+$/g, '');
            code = code.trim().replace(/^"+|"+$/g, '');

            if (code.includes('\
') || code.includes('\	') || code.includes('\"')) {
              try {
                code = JSON.parse('"' + code.replace(/"/g, '\"') + '"');
              } catch (e) {
                code = code.replace(/\
/g, '
').replace(/\	/g, '	').replace(/\"/g, '"').replace(/\\/g, '\');
              }
            }

            // Normalize path relative to project root
            let relPath = '';
            const filePathNorm = filePath.replace(/\/g, '/').toLowerCase();
            const old1Norm = oldRoot1.replace(/\/g, '/').toLowerCase();
            const old2Norm = oldRoot2.replace(/\/g, '/').toLowerCase();

            if (filePathNorm.startsWith(old1Norm)) {
              relPath = filePath.substring(oldRoot1.length);
            } else if (filePathNorm.startsWith(old2Norm)) {
              relPath = filePath.substring(oldRoot2.length);
            } else {
              const idxSrc = filePathNorm.indexOf('/src/');
              const idxFunc = filePathNorm.indexOf('/functions/');
              if (idxSrc !== -1) {
                relPath = filePath.substring(idxSrc);
              } else if (idxFunc !== -1) {
                relPath = filePath.substring(idxFunc);
              } else {
                relPath = path.basename(filePath);
              }
            }

            relPath = relPath.replace(/^[\\/]+/, '').replace(/\/g, '/');

            // Skip meta/system/temp files
            if (relPath.startsWith('.gemini') || relPath.includes('.system_generated') || relPath.endsWith('walkthrough.md') || relPath.endsWith('implementation_plan.md') || relPath.endsWith('task.md') || relPath.includes('scratch')) {
              return;
            }

            fileContents[relPath] = code;
          }
        });
      }
    } catch (e) {}
  });
});

console.log('--- Overwriting / Restoring Full Files ---');
const restored = [];
for (const relPath in fileContents) {
  const targetPath = path.join(workspaceRoot, relPath.replace(/\//g, path.sep));
  
  // We ALWAYS overwrite because the previous execution wrote truncated files.
  console.log(`Writing file: ${relPath}`);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let finalCode = fileContents[relPath];
  if (finalCode.startsWith('#') || finalCode.startsWith('import') || finalCode.startsWith('const') || finalCode.startsWith('{') || finalCode.startsWith('<')) {
    // seems ok
  } else {
    finalCode = finalCode.replace(/\
/g, '
').replace(/\	/g, '	').replace(/\"/g, '"').replace(/\\/g, '\');
  }

  fs.writeFileSync(targetPath, finalCode, 'utf8');
  console.log(`  -> Written to ${targetPath}`);
  restored.push(relPath);
}

console.log(`Reconstruction finished. Restored/overwrote ${restored.length} files.`);