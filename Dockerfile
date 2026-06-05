FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Run database migrations & seed to initialize database in container
RUN python backend/database.py && python backend/seed.py

# Expose port and start server (Cloud Run sets the PORT env variable)
ENV PORT=8080
EXPOSE 8080

CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
