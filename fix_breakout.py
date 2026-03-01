import sys

# 1. backend
with open("backend/app/main.py", "r") as f:
    text = f.read()

text = text.replace('    <div style="width: 100vw; margin-left: -50vw; position: relative; left: 50%; right: 50%; background: #f5f5f7; height: 500px; display: flex; align-items: center; justify-content: center;">', '    <div style="width: 100%; max-width: 1400px; margin: 0 auto; background: #f5f5f7; height: 500px; display: flex; align-items: center; justify-content: center;">')

text = text.replace("""    /* BREAKOUT TRICK (wcode.php Pflicht) */
    display: block;
    width: 100vw;
    position: relative;
    left: 50%;
    right: 50%;
    margin-left: -50vw;
    margin-right: -50vw;""", """    /* STANDARD LAOYUT */
    display: block;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;""")

with open("backend/app/main.py", "w") as f:
    f.write(text)

# 2. frontend
with open("frontend/src/pages/Editor.tsx", "r") as f:
    text = f.read()

text = text.replace("""    /* BREAKOUT TRICK: Volle Breite erzwingen wie lol.css */
    width: 100vw;
    position: relative;
    left: 50%;
    right: 50%;
    margin-left: -50vw;
    margin-right: -50vw;""", """    /* STANDARD LAYOUT */
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;""")

with open("frontend/src/pages/Editor.tsx", "w") as f:
    f.write(text)

# 3. .agents/rules/wcode.php
with open(".agents/rules/wcode.php", "r") as f:
    text = f.read()

text = text.replace('    <div style="width: 100vw; margin-left: -50vw; position: relative; left: 50%; right: 50%; background: #f5f5f7; height: 500px; display: flex; align-items: center; justify-content: center;">', '    <div style="width: 100%; max-width: 1400px; margin: 0 auto; background: #f5f5f7; height: 500px; display: flex; align-items: center; justify-content: center;">')

text = text.replace("""    /* BREAKOUT TRICK: Volle Breite erzwingen */
    display: block;
    width: 100vw;
    position: relative;
    left: 50%;
    right: 50%;
    margin-left: -50vw;
    margin-right: -50vw;""", """    /* STANDARD LAYOUT */
    display: block;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;""")

with open(".agents/rules/wcode.php", "w") as f:
    f.write(text)

print("Fixed breakout trick")
