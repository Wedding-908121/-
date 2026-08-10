import re

# Fix report.html
with open('public/report.html', 'r', encoding='utf-8') as f:
    rpt = f.read()

# Update catOrder
rpt = re.sub(
    r'catOrder\s*=\s*\[[^\]]+\]',
    'catOrder = [\"风电动态\", \"结构AI\", \"金属材料\", \"风机噪声\", \"风电试验\", \"风电螺栓\"]',
    rpt
)

# Update descriptions
rpt = rpt.replace('五个方向', '六个方向')
rpt = rpt.replace(
    '覆盖风电动态、金属材料、风机噪声、风电试验、风电螺栓',
    '覆盖风电动态、结构AI、金属材料、风机噪声、风电试验、风电螺栓'
)

with open('public/report.html', 'w', encoding='utf-8') as f:
    f.write(rpt)
    
print('report.html updated')
