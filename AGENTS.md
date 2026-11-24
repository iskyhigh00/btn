# Versiones de Botonera

La versión de la app se define en `version.js`. La interfaz y el service worker la leen desde ese mismo archivo.

- Aumenta la versión con cada cambio que se entregue al usuario. Usa PATCH para correcciones compatibles (2.0.1), MINOR para funciones compatibles (2.1.0) y MAJOR para cambios incompatibles (3.0.0).
- Comprueba que el encabezado muestre la versión nueva y que el service worker use la caché de esa versión. Los cambios de documentación que no alteran la app no requieren aumentar la versión.

