import json
import os
import threading
from typing import List, Optional, Dict, Any
from datetime import datetime

DATA_FILE = os.environ.get("DATA_JSON_PATH", "data.json")
_lock = threading.Lock()


def init_db():
    """Garante que o ficheiro data.json existe e é um array JSON válido."""
    with _lock:
        if not os.path.exists(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2, ensure_ascii=False)
        else:
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    conteudo = json.load(f)
                    if not isinstance(conteudo, list):
                        raise ValueError("Conteúdo deve ser uma lista")
            except Exception:
                # Se estiver corrompido, reinicializa como lista vazia
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump([], f, indent=2, ensure_ascii=False)


def _ler_dados() -> List[Dict[str, Any]]:
    """Lê todas as gravações do ficheiro data.json."""
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            dados = json.load(f)
            return dados if isinstance(dados, list) else []
    except Exception:
        return []


def _escrever_dados(dados: List[Dict[str, Any]]) -> None:
    """Guarda a lista de gravações no ficheiro data.json com indentação legível."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)


def listar_gravacoes() -> List[Dict[str, Any]]:
    """Retorna todas as gravações ordenadas pela data de criação (mais recentes primeiro)."""
    with _lock:
        dados = _ler_dados()
        # Ordena decrescente por criado_em
        return sorted(dados, key=lambda x: x.get("criado_em", ""), reverse=True)


def obter_gravacao(id_gravacao: str) -> Optional[Dict[str, Any]]:
    """Procura uma gravação pelo ID dentro do data.json."""
    with _lock:
        dados = _ler_dados()
        for item in dados:
            if str(item.get("id")) == str(id_gravacao):
                return item
        return None


def criar_gravacao(
    id_gravacao: str,
    nome: str,
    caminho: str,
    criado_em: Optional[str] = None,
    tamanho: int = 0,
) -> Dict[str, Any]:
    """Adiciona uma nova gravação ao data.json."""
    if not criado_em:
        criado_em = datetime.utcnow().isoformat() + "Z"

    novo_registo = {
        "id": str(id_gravacao),
        "nome": nome,
        "caminho": caminho,
        "criado_em": criado_em,
        "tamanho": tamanho,
    }

    with _lock:
        dados = _ler_dados()
        dados.append(novo_registo)
        _escrever_dados(dados)

    return novo_registo


def atualizar_nome_gravacao(id_gravacao: str, novo_nome: str) -> bool:
    """Atualiza o nome de uma gravação no data.json."""
    with _lock:
        dados = _ler_dados()
        encontrado = False
        for item in dados:
            if str(item.get("id")) == str(id_gravacao):
                item["nome"] = novo_nome
                encontrado = True
                break

        if encontrado:
            _escrever_dados(dados)
            return True
        return False


def eliminar_gravacao(id_gravacao: str) -> Optional[str]:
    """Remove a gravação do data.json e retorna o caminho do ficheiro para eliminação do disco."""
    with _lock:
        dados = _ler_dados()
        caminho_ficheiro = None
        novos_dados = []

        for item in dados:
            if str(item.get("id")) == str(id_gravacao):
                caminho_ficheiro = item.get("caminho")
            else:
                novos_dados.append(item)

        if caminho_ficheiro is not None:
            _escrever_dados(novos_dados)
            return caminho_ficheiro

        return None
