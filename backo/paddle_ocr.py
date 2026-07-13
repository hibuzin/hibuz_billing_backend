import sys
import json
import os
import io
import contextlib

# Hide PaddleOCR logs
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    from paddleocr import PaddleOCR

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
            "error": "Image file not found"
        }))
        sys.exit(1)

    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang="en",
            show_log=False
        )

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