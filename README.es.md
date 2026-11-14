# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md)

7 MB. Un sistema operativo AI-native ultraligero de 2026: tecnología extraterrestre en el milenio, tu fábrica de software privada hoy. Bring anything. Leave with an HTML app.

Si un sistema operativo AI-native de 2026 se hubiera abierto en tu computadora en el milenio, ¿para qué lo habrías usado?

windos2026 es la edición como plugin de DSH de NexlOS. Mete un escritorio completo dentro de DSH: 17 apps, 25 comandos, 8 idiomas de interfaz integrados, un tarball de 7.38 MiB y una sola dependencia en tiempo de ejecución. Cada app del escritorio es un `apps/<id>/index.html` más un `app.json`: se puede leer, editar y llevar.

*Traducción. La versión canónica es el README en inglés.*

## Instalación

Envía la URL del repositorio a DSH y di:

```text
https://github.com/nexxxl/windos2026
instala windos2026
```

DSH clona el repositorio y lo instala en el perfil actual con `plugin_manager install_bundle`. También puedes apuntarlo a un directorio local:

```text
plugin_manager install_bundle target=/absolute/path/to/windos2026
```

O instalar en el perfil local sin conversación:

```sh
./scripts/install-posix.sh
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Requiere Node.js 22+ y una versión de DSH que pueda cargar bundles locales. No hay publicación en npm; instálelo desde este repositorio o con el script local de arriba.

## Uso

- **Abrir el escritorio**: tras instalar, entra al escritorio web. El primer arranque pasa por la pantalla hello y pide un idioma de interfaz.
- **Una frase, una app**: describe lo que quieres en DSH; genera una app embebida y la pone en el escritorio.
- **Traer un repositorio**: dale una URL de GitHub; clona el repo, encuentra el punto de entrada y lo instala como app de escritorio.
- **Llevártelo**: una app son solo archivos. Copia `apps/<id>/` y sigue funcionando en otra máquina.

## Qué incluye

| Elemento | Número |
| --- | --- |
| Tarball | 7.38 MiB |
| Descomprimido | 10.8 MiB / 274 archivos |
| Apps | 17 |
| Comandos | 25 |
| Idiomas de interfaz | 8 integrados, 7 paquetes opcionales |
| Temas | 2 (NEXL moderno / Windos2026) |
| Dependencias de ejecución | 1 (`jpeg-js`) |
| Licencia | Apache-2.0 (salvo marcas y recursos de terceros) |

## Lo que no hace

- Sin cuenta de terceros y sin tienda de apps alojada; las apps, el código y los datos se quedan en tu máquina.
- Sin telemetría.
- Sin cambios en el sistema; el instalador solo escribe dependencias y enlaces del perfil de DSH, y desinstalar quita exactamente eso.
- Sin fuentes CJK, binarios de la edición universal ni historial interno incluidos; nada de eso está en este repositorio.
- No afirma que Windows esté completamente validado; los límites conocidos están en [Validación de Windows](docs/windows-validation.md).

## Desarrollo

```sh
npm ci
npm run check
npm test
npm pack --pack-destination /absolute/path/to/artifacts
```

Control de tamaño:

```sh
./scripts/verify-lite.sh
```

## Licencia

El código y la documentación del plugin son [Apache-2.0](LICENSE). Las marcas no se conceden con Apache-2.0; los recursos de terceros mantienen sus propias licencias. Consulta [NOTICE](NOTICE), [TRADEMARK.md](TRADEMARK.md) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
