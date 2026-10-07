import os
import shutil
import time
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import (
    init_db,
    listar_gravacoes,
    obter_gravacao,
    criar_gravacao,
    eliminar_gravacao,
    atualizar_nome_gravacao,
)

# Diretório para guardar os ficheiros de áudio enviados
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializa o ficheiro data.json ao arrancar
    init_db()
    yield


app = FastAPI(
    title="Gravador de Áudio API",
    description="API RESTful em Python para guardar, reproduzir e gerir gravações de áudio armazenadas em data.json.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configuração de CORS para permitir requisições da App Mobile (Expo/React Native) e Web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção pode restringir ao domínio da app
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir ficheiros estáticos da pasta uploads diretamente
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


class RenomearGravacaoRequest(BaseModel):
    nome: str


def formatar_url(item: dict, request: Request) -> dict:
    """Adiciona a URL pública completa do áudio ao objeto."""
    base_url = str(request.base_url).rstrip("/")
    caminho = item.get("caminho", "")
    return {
        **item,
        "uri": f"{base_url}/uploads/{caminho}",
    }


@app.get("/api/info", tags=["Geral"])
def info_api():
    """Endpoint com informações sobre a API."""
    return {
        "mensagem": "Gravador de Áudio API está online!",
        "versao": "1.0.0",
        "documentacao": "/docs",
    }


@app.get("/health", tags=["Geral"])
def health_check():
    """Endpoint de verificação de integridade (Health Check)."""
    return {"status": "ok", "timestamp": int(time.time())}


@app.get("/api/gravacoes", tags=["Gravações"])
def obter_todas_gravacoes(request: Request):
    """Lista todas as gravações registadas, ordenadas das mais recentes para as mais antigas."""
    itens = listar_gravacoes()
    return [formatar_url(item, request) for item in itens]


@app.get("/api/gravacoes/{id_gravacao}", tags=["Gravações"])
def obter_gravacao_por_id(id_gravacao: str, request: Request):
    """Obtém detalhes de uma gravação específica pelo ID."""
    item = obter_gravacao(id_gravacao)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gravação não encontrada.",
        )
    return formatar_url(item, request)


@app.get("/api/gravacoes/{id_gravacao}/audio", tags=["Gravações"])
def transmitir_audio(id_gravacao: str):
    """Transmite diretamente o ficheiro de áudio para reprodução."""
    item = obter_gravacao(id_gravacao)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gravação não encontrada.",
        )

    file_path = os.path.join(UPLOAD_DIR, item["caminho"])
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ficheiro físico de áudio não foi encontrado no servidor.",
        )

    extensao = os.path.splitext(item["caminho"])[1].lower()
    media_types = {
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".aac": "audio/aac",
    }
    media_type = media_types.get(extensao, "application/octet-stream")

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=item["caminho"],
    )


@app.post("/api/gravacoes", tags=["Gravações"], status_code=status.HTTP_201_CREATED)
async def criar_nova_gravacao(
    request: Request,
    ficheiro: UploadFile = File(...),
    nome: Optional[str] = Form(None),
):
    """Recebe um ficheiro de áudio (multipart/form-data) e guarda-o no servidor."""
    id_gravacao = f"{int(time.time() * 1000)}"

    nome_original = ficheiro.filename or "gravacao.m4a"
    extensao = os.path.splitext(nome_original)[1]
    if not extensao:
        extensao = ".m4a"

    nome_ficheiro = f"{id_gravacao}{extensao}"
    caminho_completo = os.path.join(UPLOAD_DIR, nome_ficheiro)

    # Gravar o ficheiro recebido no disco
    try:
        with open(caminho_completo, "wb") as buffer:
            shutil.copyfileobj(ficheiro.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao guardar o ficheiro: {str(e)}",
        )
    finally:
        await ficheiro.close()

    tamanho = os.path.getsize(caminho_completo) if os.path.exists(caminho_completo) else 0
    nome_final = nome.strip() if nome and nome.strip() else f"Gravação {id_gravacao}"

    novo_item = criar_gravacao(
        id_gravacao=id_gravacao,
        nome=nome_final,
        caminho=nome_ficheiro,
        tamanho=tamanho,
    )

    return formatar_url(novo_item, request)


@app.patch("/api/gravacoes/{id_gravacao}", tags=["Gravações"])
@app.put("/api/gravacoes/{id_gravacao}", tags=["Gravações"])
def renomear_gravacao(
    id_gravacao: str,
    dados: RenomearGravacaoRequest,
    request: Request,
):
    """Altera o nome de uma gravação existente."""
    if not dados.nome.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O nome não pode estar vazio.",
        )

    atualizado = atualizar_nome_gravacao(id_gravacao, dados.nome.strip())
    if not atualizado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gravação não encontrada.",
        )

    item = obter_gravacao(id_gravacao)
    return formatar_url(item, request)


@app.delete("/api/gravacoes/{id_gravacao}", tags=["Gravações"])
def apagar_gravacao(id_gravacao: str):
    """Elimina uma gravação da base de dados e apaga o ficheiro físico do disco."""
    caminho_ficheiro = eliminar_gravacao(id_gravacao)
    if not caminho_ficheiro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gravação não encontrada.",
        )

    # Apagar ficheiro físico do disco se existir
    ficheiro_disco = os.path.join(UPLOAD_DIR, caminho_ficheiro)
    if os.path.exists(ficheiro_disco):
        try:
            os.remove(ficheiro_disco)
        except OSError:
            pass

    return {"sucesso": True, "mensagem": "Gravação eliminada com sucesso."}


# Servir a aplicação Web (Expo Web em dist/) diretamente na raiz /
DIST_DIR = os.path.join(os.path.dirname(__file__), "dist")
if not os.path.isdir(DIST_DIR):
    DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))

if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    porta = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"A iniciar API em http://{host}:{porta}")
    uvicorn.run("main:app", host=host, port=porta, reload=True)
