"""Audit-only SLU class rules; never imported by the application."""
import numpy as np


def soil_metrics(values):
    """Whole-cell denominator for fractions; only classes 1–3 for moisture."""
    a = np.asarray(values)
    land = (a >= 1) & (a <= 3)
    weights = np.zeros(256, dtype=float)
    weights[1:4] = [0.15, 0.45, 0.70]
    return {
        "land": float(weights[a[land]].mean()) if land.any() else None,
        "water": float((a == 4).sum() / a.size),
        "valid": float(((a >= 1) & (a <= 4)).sum() / a.size),
    }