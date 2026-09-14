"""Errores del proyecto, pensados para que el mensaje diga que hacer."""

from __future__ import annotations


class ForgeError(Exception):
    """Base de todos los errores de VideoForge."""

    def __init__(self, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint

    def __str__(self) -> str:
        if self.hint:
            return f"{self.message}\n  -> {self.hint}"
        return self.message


class ToolchainError(ForgeError):
    """Falta un binario externo (ffmpeg/ffprobe) o no es utilizable."""


class ProbeError(ForgeError):
    """No se pudo leer el fichero de entrada."""


class RenderError(ForgeError):
    """El render fallo. Suele traer el stderr de ffmpeg recortado."""


class AnalysisError(ForgeError):
    """Una etapa de analisis no pudo completarse."""


class PlanError(ForgeError):
    """El planner no pudo construir un EDL valido."""
