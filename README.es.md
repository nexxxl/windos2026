# windos2026

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md)

7.95 MiB. Un sistema operativo AI-native ultraligero de 2026: tecnología extraterrestre en el milenio, tu fábrica de software privada hoy. Bring anything. Leave with an HTML app.

Si un sistema operativo AI-native de 2026 se hubiera abierto en tu computadora en el milenio, ¿para qué lo habrías usado?

windos2026 es la edición como plugin de DSH de NexlOS. Mete un escritorio completo dentro de DSH: 17 apps, 25 comandos, 8 idiomas de interfaz integrados, un tarball de 7.95 MiB y una sola dependencia en tiempo de ejecución. Las apps generadas son archivos bajo `apps/<id>/`; las 17 apps integradas vienen como código en `webos/`.

*Traducción. La versión canónica es el README en inglés.*

¿Recuerdas cómo era el escritorio de la primera computadora que usaste? Este es el que puedes hacer tuyo: lo armas tú, una frase a la vez, y cada app se va contigo como un archivo. Linux le dio una máquina a cada programa; NexlOS le da una computadora a cada agente.

## Tres cosas siguen siendo tuyas

**Tu modelo.** El plugin no incluye key ni define un provider por defecto. Lee lo que ya tiene tu perfil de DSH, y cuando no ve un modelo lo dice: la capa de capacidades responde `501` con un motivo y el indicador de modelo muestra `unavailable`, en lugar de fingir que está listo.

**Tus apps.** Di una frase en DSH: el generador escribe `apps/<id>/index.html` más `app.json`, abre la página en un navegador para verificarla, la repara una vez si esa comprobación falla y deja el icono en tu escritorio. Copia ese directorio a cualquier servidor estático y sigue funcionando; dale una URL de GitHub y `importGithubApp` clona el repositorio, encuentra el punto de entrada compilado y lo monta como app.

**Tu máquina.** 7,95 MiB dan 17 apps, 25 comandos y 8 idiomas de interfaz dentro del harness que ya ejecutas: sin un segundo plano de control que desplegar, sin cuenta, sin telemetría. Instala el mismo bundle en otro perfil de DSH y usará el modelo de ese perfil, no el nuestro.

## Dos ediciones, dos licencias

| Edición | Qué obtienes | Licencia |
| --- | --- | --- |
| **Plugin** (código de este repositorio) | el paquete de 7.95 MiB descrito abajo | [Apache-2.0](LICENSE) |
| **Universal** (Releases) | un binario autocontenido con su propia carcasa de ventana nativa | el núcleo y la carcasa cerrados bajo [NexlOS Binary License 1.0](docs/LICENSE-BINARY.md); la capa de escritorio incluida mantiene Apache-2.0 |

El mapa autoritativo archivo por archivo está en [LICENSING.md](LICENSING.md).

La edición universal aún no está publicada: Releases seguirá vacío hasta que cierre la revisión de derechos de sus recursos.

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
- **Llevártelo**: una app generada son solo archivos. Copia `apps/<id>/` y sigue funcionando en otra máquina.

## Qué incluye

| Elemento | Número |
| --- | --- |
| Tarball | 7.95 MiB |
| Descomprimido | 12.6 MiB / 293 archivos |
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
- El tarball publicado y el candidato público de código fuente no incluyen paquete de fuentes CJK de oficina, binarios de la edición universal ni historial interno. La única fuente CJK del tarball es la fuente de píxeles OFL declarada en THIRD_PARTY_NOTICES.
- No se afirma que Windows esté completamente validado; la ruta de Windows se trata como alpha.

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

El código del plugin en este repositorio es Apache-2.0. Los binarios de la edición universal siguen una licencia aparte; consulta [LICENSING.md](LICENSING.md) para el mapa y [LICENSE-BINARY.md](docs/LICENSE-BINARY.md) para sus términos.

El código y la documentación del plugin son [Apache-2.0](LICENSE). Las marcas no se conceden con Apache-2.0; los recursos de terceros mantienen sus propias licencias. Consulta [NOTICE](NOTICE), [TRADEMARK.md](TRADEMARK.md) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
