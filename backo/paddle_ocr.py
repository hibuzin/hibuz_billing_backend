import sys
import json
import os
import cv2
from paddleocr import PaddleOCR

# Load OCR model only once
ocr = PaddleOCR(
    use_angle_cls=True,
    lang="en",
    show_log=False
)

try:
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Image path not provided"
        }))
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.exists(image_path):
        print(json.dumps({
            "success": False,
            "error": "Image not found"
        }))
        sys.exit(1)

    # Read image
    img = cv2.imread(image_path)

    if img is None:
        print(json.dumps({
            "success": False,
            "error": "Cannot read image"
        }))
        sys.exit(1)

    # Resize large images (important for Render)
    h, w = img.shape[:2]

    if w > 1200:
        ratio = 1200 / w
        img = cv2.resize(img, (1200, int(h * ratio)))

    result = ocr.ocr(img, cls=True)

    texts = []

    if result and result[0]:
        for line in result[0]:
            texts.append(line[1][0])

    print(json.dumps({
        "success": True,
        "text": "\n".join(texts)
    }))

except Exception as e:
    import traceback

    print(json.dumps({
        "success": False,
        "error": str(e),
        "traceback": traceback.format_exc()
    }))