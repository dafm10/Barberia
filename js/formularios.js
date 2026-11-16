// Presentación compartida de validaciones del navegador y respuestas de Django.
window.formularios = (() => {
    const root = document.getElementById('barber-prototype');

    function texto(valor) {
        if (Array.isArray(valor)) return valor.map(texto).join(' ');
        if (valor && typeof valor === 'object') return Object.values(valor).map(texto).join(' ');
        return String(valor ?? '');
    }

    function limpiarCampo(campo) {
        const id = campo.dataset.errorId;
        if (!id) return;
        document.getElementById(id)?.remove();
        const descripcion = (campo.getAttribute('aria-describedby') || '').split(' ').filter(valor => valor && valor !== id);
        if (descripcion.length) campo.setAttribute('aria-describedby', descripcion.join(' '));
        else campo.removeAttribute('aria-describedby');
        campo.removeAttribute('aria-invalid');
        delete campo.dataset.errorId;
    }

    function marcarCampo(campo, mensaje) {
        limpiarCampo(campo);
        const error = document.createElement('p');
        error.id = `${campo.id || campo.form.id + '-' + campo.name}-error`;
        error.className = 'field-error';
        error.textContent = texto(mensaje);
        error.setAttribute('role', 'alert');
        const grupo = campo.type === 'checkbox' ? campo.closest('fieldset') : null;
        (grupo || campo).insertAdjacentElement('afterend', error);
        campo.dataset.errorId = error.id;
        campo.setAttribute('aria-invalid', 'true');
        const descripcion = campo.getAttribute('aria-describedby');
        campo.setAttribute('aria-describedby', [descripcion, error.id].filter(Boolean).join(' '));
    }

    function limpiar(formulario) {
        formulario.querySelectorAll('[data-error-id]').forEach(limpiarCampo);
        formulario.querySelectorAll('.form-feedback').forEach(elemento => elemento.remove());
    }

    function notificar(formulario, mensaje, tipo = 'error') {
        formulario.querySelectorAll('.form-feedback').forEach(elemento => elemento.remove());
        const aviso = document.createElement('p');
        aviso.className = `form-feedback ${tipo === 'success' ? 'form-success' : 'field-error'}`;
        aviso.setAttribute('role', tipo === 'success' ? 'status' : 'alert');
        aviso.textContent = mensaje;
        formulario.append(aviso);
    }

    function validar(formulario) {
        limpiar(formulario);
        const valido = formulario.checkValidity();
        if (!valido) formulario.querySelector('[aria-invalid="true"]')?.focus();
        return valido;
    }

    function mostrarErrores(formulario, error, alias = {}) {
        limpiar(formulario);
        const generales = [];
        const campos = [...formulario.querySelectorAll('input, select, textarea')];
        function recorrer(errores, ruta = '') {
            for (const [clave, valor] of Object.entries(errores)) {
                const nombre = ruta ? `${ruta}.${clave}` : clave;
                if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
                    recorrer(valor, nombre);
                    continue;
                }
                const destino = alias[nombre] || alias[clave] || clave;
                const campo = campos.find(elemento => elemento.name === destino);
                if (campo) marcarCampo(campo, valor);
                else generales.push(texto(valor));
            }
        }
        if (error.campos && typeof error.campos === 'object' && !Array.isArray(error.campos)) {
            recorrer(error.campos);
        }
        if (generales.length) notificar(formulario, generales.join(' '));
        else if (!formulario.querySelector('[aria-invalid="true"]')) notificar(formulario, error.message);
        formulario.querySelector('[aria-invalid="true"]')?.focus();
    }

    root.addEventListener('invalid', evento => {
        evento.preventDefault();
        marcarCampo(evento.target, evento.target.validationMessage);
    }, true);
    root.addEventListener('input', evento => {
        if (evento.target.matches('input, textarea')) limpiarCampo(evento.target);
    });
    root.addEventListener('change', evento => {
        if (!evento.target.matches('select, input') || !evento.target.validity.valid) return;
        const grupo = evento.target.closest('fieldset');
        if (grupo) grupo.querySelectorAll('[data-error-id]').forEach(limpiarCampo);
        else limpiarCampo(evento.target);
    });
    return { limpiar, limpiarCampo, marcarCampo, validar, mostrarErrores, notificar };
})();
