import re

with open('scripts/generate_pdf.mjs', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace chromium.launch call
js = re.sub(
    r'chromium\.launch\(\{.*?\}\)',
    "chromium.launch({ channel: 'msedge', headless: true })",
    js,
    flags=re.DOTALL
)

with open('scripts/generate_pdf.mjs', 'w', encoding='utf-8') as f:
    f.write(js)

print('Switched to msedge channel')
