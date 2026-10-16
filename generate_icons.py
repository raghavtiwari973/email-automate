from PIL import Image
from pathlib import Path

img = Image.open('sapcon_mobile/assets/images/image1.png').convert('RGB')
# Crop tightly to the SAPCON logo boundaries (no white border)
cropped = img.crop((195, 60, 647, 535))

# Make it a clean square
max_side = max(cropped.width, cropped.height)
square_logo = Image.new('RGB', (max_side, max_side), (255, 255, 255))
x = (max_side - cropped.width) // 2
y = (max_side - cropped.height) // 2
square_logo.paste(cropped, (x, y))

sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
}

res_dir = Path('sapcon_mobile/android/app/src/main/res')
for folder, size in sizes.items():
    out_folder = res_dir / folder
    out_folder.mkdir(parents=True, exist_ok=True)
    resized = square_logo.resize((size, size), Image.Resampling.LANCZOS)
    target_file = out_folder / 'ic_launcher.png'
    resized.save(target_file, format='PNG')
    print('Generated full-bleed logo icon:', target_file, size)
