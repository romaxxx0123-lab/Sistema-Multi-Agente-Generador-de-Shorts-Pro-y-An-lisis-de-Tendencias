# Follaje con hojas reales

`make_foliage.py` arma las texturas de follaje del juego con hojas reales escaneadas del modelo
`island_tree_02` de [Poly Haven](https://polyhaven.com) (dominio público, CC0):

- `assets/vegetation/leaves.webp`: ramillete de hojas con huecos y borde irregular (copas de árboles).
- `assets/vegetation/frond.webp`: fronda pinnada de palmera con folíolos reales largos y angostos.

```sh
python3 tools/vegetation/make_foliage.py island_tree_02_leaves_diff_1k.jpg assets/vegetation
```
