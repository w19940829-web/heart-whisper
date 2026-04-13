import sys
import subprocess

files = ['js/storage.js', 'js/audio.js', 'js/library.js', 'js/gacha.js', 'app.js', 'bible-reader.js']
for f in files:
    try:
        # We can use osacript (JavaScript for Automation) built-in on macOS to syntax check JS!
        res = subprocess.run(['osascript', '-l', 'JavaScript', '-e', f'try {{ eval(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError("{f}", 4, null))); console.log("OK") }} catch(e) {{ console.log("ERROR in " + "{f}" + ": " + e.message) }}'], capture_output=True, text=True)
        if "SyntaxError" in res.stderr or "SyntaxError" in res.stdout or "Error" in res.stderr:
            print(f"Error in {f}: {res.stderr} {res.stdout}")
    except Exception as e:
        print(f"Failed to check {f}: {e}")
