const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\sathi\\.gemini\\antigravity-ide\\brain\\7ea6746b-d93f-45ce-917d-abe432f735e4\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const files = new Set();
  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);
      if (entry.tool_calls) {
        for (const call of entry.tool_calls) {
          if (call.args && call.args.TargetFile) {
            files.add(call.args.TargetFile);
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  console.log('Modified files in 7ea6746b-d93f-45ce-917d-abe432f735e4:');
  for (const file of files) {
    console.log(file);
  }
}

processLineByLine();