FROM node:20-bullseye

# Install Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY requirements.txt ./

# Upgrade pip
RUN python3 -m pip install --upgrade pip

# Install Python packages
RUN python3 -m pip install --no-cache-dir -r requirements.txt

# Remove any corrupted PaddleOCR model cache
RUN rm -rf /root/.paddleocr

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]