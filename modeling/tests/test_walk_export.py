import numpy as np

from walk_export import pack_mesh


def test_pack_mesh_groups_by_texture_and_flips_v():
    V = np.zeros((4, 3), "<f4")
    F = np.array([[0, 1, 2], [1, 2, 3], [0, 2, 3]], "<u4")
    UV = np.array([[0, 0.25], [1, 0.0], [0, 1.0], [1, 1.0]], "<f4")
    T = np.array([1, 0, 1])
    names = np.array(["a.jpg", "b.jpg"])
    V2, F2, uv, groups = pack_mesh(V, F, UV, T, names)
    # triangle 1 (texture 0) first, then the two texture-1 triangles in original order
    assert F2.tolist() == [[1, 2, 3], [0, 1, 2], [0, 2, 3]]
    assert groups == [{"tex": "a.jpg", "start": 0, "count": 3}, {"tex": "b.jpg", "start": 3, "count": 6}]
    assert np.allclose(uv[:, 1], [0.75, 1.0, 0.0, 0.0])
    assert UV[0, 1] == 0.25  # input untouched


def test_pack_mesh_untextured_triangles_get_empty_name():
    F = np.array([[0, 1, 2]], "<u4")
    _, _, _, groups = pack_mesh(np.zeros((3, 3), "<f4"), F, np.zeros((3, 2), "<f4"), np.array([-1]), np.array(["x.jpg"]))
    assert groups == [{"tex": "", "start": 0, "count": 3}]
