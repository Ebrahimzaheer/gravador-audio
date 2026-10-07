FROM python:3.11-slim

WORKDIR /app

# Instalar dependências
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar ficheiros da aplicação
COPY . .

# Criar pasta para uploads
RUN mkdir -p uploads

# Expor porta padrão
EXPOSE 8000

# Executar servidor Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
