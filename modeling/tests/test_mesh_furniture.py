import numpy as np
import pytest

import mesh_furniture as mf


def quad_mesh(z, size=4.0, flip=False):
    """Horizontal square at height z, two triangles, normal +z (or -z if flip)."""
    V = np.array([[0, 0, z], [size, 0, z], [size, size, z], [0, size, z]], float)
    F = np.array([[0, 1, 2], [0, 2, 3]])
    if flip:
        F = F[:, ::-1]
    return V, F


@pytest.mark.parametrize("z", [0.0, 1.25])  # z=0.0 reproduced the original argmax-of-empty crash
def test_flat_floor_does_not_crash_and_finds_height(z):
    # A perfectly flat floor: every sample has the same z. This used to raise
    # "attempt to get argmax of an empty sequence" in the floor-height histogram.
    V, F = quad_mesh(z)
    P, N, _, _ = mf.sample_surface(V, F, 0.1, np.random.default_rng(0))
    floor = mf.estimate_floor_z(P, N)
    assert abs(floor - z) <= 0.02


def test_floor_with_ceiling_picks_floor():
    Vf, Ff = quad_mesh(0.0)
    Vc, Fc = quad_mesh(2.6, flip=True)
    V = np.vstack([Vf, Vc])
    F = np.vstack([Ff, Fc + 4])
    P, N, _, _ = mf.sample_surface(V, F, 0.1, np.random.default_rng(0))
    assert abs(mf.estimate_floor_z(P, N)) <= 0.02


def test_no_upward_faces_falls_back_to_lowest_point():
    V, F = quad_mesh(0.7, flip=True)  # only downward-facing
    P, N, _, _ = mf.sample_surface(V, F, 0.1, np.random.default_rng(0))
    assert abs(mf.estimate_floor_z(P, N) - 0.7) < 1e-9


def test_empty_mesh_raises_clear_error():
    with pytest.raises(ValueError):
        mf.estimate_floor_z(np.zeros((0, 3)), np.zeros((0, 3)))


def test_sloped_noisy_floor_mode_near_true_height():
    rng = np.random.default_rng(1)
    V, F = quad_mesh(0.0, size=6.0)
    P, N, _, _ = mf.sample_surface(V, F, 0.05, rng)
    P = P.copy()
    P[:, 2] += rng.normal(0, 0.003, len(P))
    assert abs(mf.estimate_floor_z(P, N)) <= 0.04
