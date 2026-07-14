import sys
import json
import os
import cv2
import traceback
import time

# Import PaddleOCR
try:
    from paddleocr import PaddleOCR
    print("IMPORT SUCCESS", file=sys.stderr)
except Exception:
    print(traceback.format_exc(), file=sys.stderr)
    print(json.dumps({
        "success": False,
        "error": "Failed to import paddleocr"
    }))
    sys.exit(1)

print("PYTHON:", sys.executable, file=sys.stderr)
print("VERSION:", sys.version, file=sys.stderr)

# Load OCR model
try:
    print("Loading OCR model...", file=sys.stderr)

    ocr = PaddleOCR(
        use_angle_cls=False,
        lang="en",
        use_gpu=False,
        show_log=False
    )

    print("OCR model loaded successfully", file=sys.stderr)

except Exception:
    print(traceback.format_exc(), file=sys.stderr)
    print(json.dumps({
        "success": False,
        "error": "Failed to initialize PaddleOCR"
    }))
    sys.exit(1)

try:

    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Image path not provided"
        }))
        sys.exit(1)

    image_path = sys.argv[1]

    print("Image Path:", image_path, file=sys.stderr)
    print("Image Exists:", os.path.exists(image_path), file=sys.stderr)

    if not os.path.exists(image_path):
        print(json.dumps({
            "success": False,
            "error": "Image not found"
        }))
        sys.exit(1)

    img = cv2.imread(image_path)

    if img is None:
        print(json.dumps({
            "success": False,
            "error": "Cannot read image"
        }))
        sys.exit(1)

    print("Image Shape:", img.shape, file=sys.stderr)

    h, w = img.shape[:2]

    if w > 1200:
        ratio = 1200 / w
        img = cv2.resize(img, (1200, int(h * ratio)))
        print("Image resized", file=sys.stderr)

    print("Running OCR...", file=sys.stderr)

    print("Before OCR", file=sys.stderr)
    sys.stderr.flush()

    start = time.time()

    result = ocr.ocr(img, cls=False)


    print("After OCR", file=sys.stderr)
    sys.stderr.flush()

    print("OCR Time:", time.time() - start, file=sys.stderr)
    print("Result Type:", type(result), file=sys.stderr)

    texts = []

    if result and result[0]:
        for line in result[0]:
            texts.append(line[1][0])

    print("Detected Text Count:", len(texts), file=sys.stderr)

    print(json.dumps({
        "success": True,
        "text": "\n".join(texts)
    }))

    sys.stdout.flush()
    sys.exit(0)

except Exception:
    print(traceback.format_exc(), file=sys.stderr)

    print(json.dumps({
        "success": False,
        "error": "OCR processing failed",
        "traceback": traceback.format_exc()
    }))

    sys.stdout.flush()
    sys.exit(1)