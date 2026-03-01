import sys

with open("backend/app/main.py", "r") as f:
    text = f.read()

# 1. JS
text = text.replace("""    // Scroll-In Animationen
    if('IntersectionObserver' in window) {{
        const animObs = new IntersectionObserver((entries) => {{
            entries.forEach(e => {{ if(e.isIntersecting) {{ e.target.classList.add('ds-visible'); animObs.unobserve(e.target); }} }});
        }}, {{threshold: 0.08}});
        shadow.querySelectorAll('.ds-anim').forEach(el => animObs.observe(el));
    }}

""", "")

text = text.replace("""  var io = new IntersectionObserver(function(entries){{
    entries.forEach(function(e){{ if(e.isIntersecting){{ e.target.classList.add('ds-visible'); io.unobserve(e.target); }} }});
  }}, {{threshold:0.1}});
  document.currentScript.getRootNode().querySelectorAll('.ds-anim').forEach(function(el){{ io.observe(el); }});\n""", "")


# 2. CSS
text = text.replace(".ds-anim {{ opacity: 0; transform: translateY(18px); transition: opacity 0.6s ease, transform 0.6s ease; }}\n", "")
text = text.replace(".ds-anim.ds-visible {{ opacity: 1; transform: translateY(0); }}\n", "")

text = text.replace(".ds-anim{{opacity:0;transform:translateY(20px);transition:opacity .6s ease,transform .6s ease;}}\n", "")
text = text.replace(".ds-anim.ds-visible{{opacity:1;transform:translateY(0);}}\n", "")

# 3. HTML
text = text.replace(' class="ds-anim"', '')
text = text.replace(' ds-anim"', '"')

with open("backend/app/main.py", "w") as f:
    f.write(text)

print("Fixed main.py")
