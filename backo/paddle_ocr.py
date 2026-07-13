import sys
import json
import os
import io
import contextlib

# Hide all stdout logs while importing/loading PaddleOCR
with contextlib.redirect_stdout(io.StringIO()):
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

image_path = sys.argv[1]

try:
    if not os.path.exists(image_path):
        print(json.dumps({
            "success": False,
            "error": "Image file not found"
        }))
        sys.exit()

    # Hide PaddleOCR logs during OCR
    with contextlib.redirect_stdout(io.StringIO()):
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