FROM node:20-bullseye

# Install Python and required system libraries
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node packages
COPY package*.json ./
RUN npm install

# Install Python packages
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip
RUN python3 -m pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Remove any corrupted PaddleOCR cache
RUN rm -rf /root/.paddleocr

# Download PaddleOCR models during build
RUN python3 -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en', show_log=False)"

EXPOSE 10000

CMD ["node", "server.js"]