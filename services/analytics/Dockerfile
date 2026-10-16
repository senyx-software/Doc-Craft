FROM python:3.11-slim
WORKDIR /app/services/analytics
COPY services/analytics/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY shared /app/shared
COPY services/analytics/ ./
ENV PYTHONPATH=/app
EXPOSE 3017
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3017"]
