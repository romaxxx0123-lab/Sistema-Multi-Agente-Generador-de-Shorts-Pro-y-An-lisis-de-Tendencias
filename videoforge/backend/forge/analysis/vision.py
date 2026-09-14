"""Etiquetado visual con CLIP, opcional y local.

El diseno evita el problema tipico de meter CLIP en un proyecto: normalmente
hace falta el codificador de imagen **y** el de texto, con su tokenizador BPE.
Aqui solo se necesita el de imagen, porque las etiquetas del vocabulario traen
su embedding **ya calculado** en un fichero aparte.

Consecuencias practicas: sin tokenizador, sin PyTorch, un unico paso de ONNX
Runtime por fotograma, y la GPU se usa sola si esta disponible.

Es opcional a proposito. Sin los ficheros del modelo el sistema sigue
funcionando: identifica el video por el texto en pantalla y por lo que se dice.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

import numpy as np

from ..config import Device, Settings
from .frames import extract_frames_at

#: Tamano de entrada de CLIP ViT.
INPUT_SIZE = 224
#: Normalizacion con la que se entreno CLIP. No son los valores de ImageNet.
CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
#: Por debajo de esto la etiqueta no es fiable.
MIN_LABEL_SCORE = 0.18


@dataclass
class VisionTag:
    """Una etiqueta con su confianza."""

    label: str
    score: float
    at: float


@runtime_checkable
class VisionTagger(Protocol):
    """Lo unico que el resto del sistema necesita de un etiquetador."""

    available: bool

    def tag(self, frames: list[np.ndarray], timestamps: list[float]) -> list[VisionTag]:
        ...


def preprocess(frame: np.ndarray) -> np.ndarray:
    """Deja un fotograma RGB listo para CLIP: NCHW, normalizado."""
    imagen = frame.astype(np.float32) / 255.0
    imagen = (imagen - CLIP_MEAN) / CLIP_STD
    return np.transpose(imagen, (2, 0, 1))[None, ...].astype(np.float32)


def _l2(vectors: np.ndarray) -> np.ndarray:
    normas = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.maximum(normas, 1e-8)


class OnnxClipTagger:
    """Etiquetador basado en el codificador de imagen de CLIP en ONNX."""

    def __init__(self, model_path: Path, labels_path: Path, device: Device = Device.CPU) -> None:
        self.model_path = Path(model_path)
        self.labels_path = Path(labels_path)
        self.device = device
        self.available = False
        self._session = None
        self._labels: list[str] = []
        self._embeddings: np.ndarray | None = None
        self._load()

    def _load(self) -> None:
        if not (self.model_path.is_file() and self.labels_path.is_file()):
            return
        try:
            import onnxruntime as ort
        except ImportError:
            return

        try:
            datos = np.load(self.labels_path, allow_pickle=True)
            self._labels = [str(x) for x in datos["labels"]]
            self._embeddings = _l2(datos["embeddings"].astype(np.float32))

            proveedores = ["CPUExecutionProvider"]
            if self.device is Device.CUDA:
                # Si el paquete de GPU no esta, ONNX Runtime ignora el proveedor
                # y sigue en CPU, que es justo lo que queremos.
                proveedores.insert(0, "CUDAExecutionProvider")
            self._session = ort.InferenceSession(str(self.model_path), providers=proveedores)
            self.available = True
        except Exception:
            self.available = False

    def tag(self, frames: list[np.ndarray], timestamps: list[float]) -> list[VisionTag]:
        if not self.available or self._session is None or self._embeddings is None:
            return []

        nombre_entrada = self._session.get_inputs()[0].name
        etiquetas: list[VisionTag] = []

        for frame, ts in zip(frames, timestamps):
            try:
                salida = self._session.run(None, {nombre_entrada: preprocess(frame)})[0]
            except Exception:
                continue
            vector = _l2(np.asarray(salida, dtype=np.float32).reshape(1, -1))
            similitudes = (vector @ self._embeddings.T).ravel()

            mejor = int(np.argmax(similitudes))
            score = float(similitudes[mejor])
            if score >= MIN_LABEL_SCORE:
                etiquetas.append(
                    VisionTag(label=self._labels[mejor], score=round(score, 4), at=round(ts, 3))
                )

        return etiquetas


class NullTagger:
    """Cuando no hay modelo. Permite que el resto del codigo no se entere."""

    available = False

    def tag(self, frames: list[np.ndarray], timestamps: list[float]) -> list[VisionTag]:
        return []


def model_paths(settings: Settings) -> tuple[Path, Path]:
    return (
        settings.models_dir / "clip_image_encoder.onnx",
        settings.models_dir / "clip_labels.npz",
    )


def build_tagger(settings: Settings, device: Device = Device.CPU) -> VisionTagger:
    """Devuelve el etiquetador disponible, o uno vacio si no hay modelo."""
    modelo, etiquetas = model_paths(settings)
    tagger = OnnxClipTagger(modelo, etiquetas, device)
    return tagger if tagger.available else NullTagger()


def tag_video(
    proxy_video: Path,
    settings: Settings,
    timestamps: list[float],
    tagger: VisionTagger,
) -> list[VisionTag]:
    """Etiqueta el video en los instantes indicados."""
    if not tagger.available:
        return []
    frames = extract_frames_at(
        proxy_video, settings, timestamps, width=INPUT_SIZE, height=INPUT_SIZE
    )
    return tagger.tag(frames, timestamps[: len(frames)])
