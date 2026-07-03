from paddleocr import PaddleOCR
import sys
import json
import os

ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

image_path = sys.argv[1]

try:
    if not os.path.exists(image_path):
        print(json.dumps({
            "success": False,
            "error": "Image file not found",
            "path": image_path
        }))
        sys.exit()

    result = ocr.ocr(image_path, cls=True)

    texts = []

    if result and result[0]:
        for line in result[0]:
            texts.append(line[1][0])

    print(json.dumps({
        "success": True,
        "text": "\n".join(texts)
    }))

except Exception as e:
    print(json.dumps({
        "success": False,
        "error": str(e)
    }))