FROM python:3.11-slim
WORKDIR /app/services/admin-api
COPY services/admin-api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY shared /app/shared
COPY services/admin-api/ ./
ENV PYTHONPATH=/app
EXPOSE 3018
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3018"]
