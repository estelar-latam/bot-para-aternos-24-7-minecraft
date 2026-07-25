# Imagen con Python + Node.js para correr las dos piezas del bot a la vez.
FROM python:3.11-slim

# Instala Node.js 20 sobre la imagen de Python.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates bash \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependencias primero (mejor cache).
COPY requirements.txt package.json ./
RUN pip install --no-cache-dir -r requirements.txt \
    && npm install --omit=dev

# Copia el resto del proyecto.
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["bash", "start.sh"]
