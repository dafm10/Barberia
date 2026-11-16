// Selector de horas con la paleta de la barbería, sin el desplegable nativo.
(() => {
    const root = document.getElementById('barber-prototype');
    const formato = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    let campo = null;
    let panel = null;

    function cerrar(restaurarFoco = false) {
        const anterior = campo;
        panel?.remove();
        anterior?.setAttribute('aria-expanded', 'false');
        anterior?.removeAttribute('aria-controls');
        panel = null;
        campo = null;
        if (restaurarFoco && anterior?.isConnected) anterior.focus();
    }

    function validar(entrada) {
        entrada.setCustomValidity(!entrada.value || formato.test(entrada.value)
            ? '' : 'Usa una hora de 24 horas, por ejemplo 09:30 o 16:45:00.');
    }

    function normalizar(entrada) {
        validar(entrada);
        if (formato.test(entrada.value) && entrada.value.length === 5) entrada.value += ':00';
    }

    function partes() {
        return formato.test(campo.value) ? campo.value.split(':').map(Number) : [0, 0, 0];
    }

    function marcarSeleccion() {
        const valores = partes();
        panel.querySelectorAll('[data-hour-part]').forEach(boton => {
            const elegido = Number(boton.dataset.hourValue) === (valores[Number(boton.dataset.hourPart)] || 0);
            boton.setAttribute('aria-selected', String(elegido));
            boton.tabIndex = elegido ? 0 : -1;
        });
    }

    function elegir(boton) {
        const valores = partes();
        valores[Number(boton.dataset.hourPart)] = Number(boton.dataset.hourValue);
        campo.value = [0, 1, 2].map(indice => String(valores[indice] || 0).padStart(2, '0')).join(':');
        validar(campo);
        campo.dispatchEvent(new Event('input', {bubbles: true}));
        campo.dispatchEvent(new Event('change', {bubbles: true}));
        marcarSeleccion();
    }

    function abrir(entrada) {
        if (entrada.disabled || entrada.readOnly) return;
        if (campo === entrada && panel?.isConnected) return;
        cerrar();
        campo = entrada;
        panel = document.createElement('div');
        panel.id = `${entrada.id}-selector`;
        panel.className = 'time-picker-panel';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Seleccionar hora en formato de 24 horas');
        panel.innerHTML = `<div class="time-picker-columns">${['Hora', 'Minuto', 'Segundo'].map((nombre, indice) => `
            <div><div class="time-picker-label">${nombre}</div>
            <div class="time-picker-list" role="listbox" aria-label="${nombre}">
                ${Array.from({length: indice === 0 ? 24 : 60}, (_, valor) => `
                    <button type="button" role="option" aria-selected="false" data-hour-part="${indice}" data-hour-value="${valor}" tabindex="-1">${String(valor).padStart(2, '0')}</button>
                `).join('')}
            </div></div>
        `).join('')}</div><div class="time-picker-footer"><span>Formato de 24 horas</span><button type="button" class="primary" data-hour-done>Listo</button></div>`;
        entrada.insertAdjacentElement('afterend', panel);
        entrada.setAttribute('aria-expanded', 'true');
        entrada.setAttribute('aria-controls', panel.id);
        marcarSeleccion();
        panel.querySelectorAll('.time-picker-list').forEach(lista => {
            const elegido = lista.querySelector('[aria-selected="true"]');
            lista.scrollTop = elegido.offsetTop - lista.clientHeight / 2 + elegido.offsetHeight / 2;
        });
    }

    root.addEventListener('click', evento => {
        if (evento.target.matches('[data-time-picker]')) {
            abrir(evento.target);
            return;
        }
        const selector = evento.target.closest('.time-picker-panel');
        if (!selector) return;
        // Evita que los botones del selector redibujen el formulario administrativo.
        evento.stopPropagation();
        const opcion = evento.target.closest('[data-hour-part]');
        if (opcion && campo?.isConnected) elegir(opcion);
        if (evento.target.closest('[data-hour-done]')) cerrar(true);
    }, true);

    document.addEventListener('click', evento => {
        if (campo && evento.target !== campo && !panel?.contains(evento.target)) cerrar();
    });
    root.addEventListener('input', evento => {
        if (!evento.target.matches('[data-time-picker]')) return;
        validar(evento.target);
        if (campo === evento.target && panel?.isConnected) marcarSeleccion();
    });
    root.addEventListener('focusout', evento => {
        if (evento.target.matches('[data-time-picker]')) normalizar(evento.target);
        if (panel && evento.relatedTarget && evento.relatedTarget !== campo && !panel.contains(evento.relatedTarget)) cerrar();
    });
    root.addEventListener('submit', evento => {
        evento.target.querySelectorAll('[data-time-picker]').forEach(normalizar);
        cerrar();
    }, true);
    root.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && panel) {
            evento.preventDefault();
            evento.stopPropagation();
            cerrar(true);
            return;
        }
        if (evento.target.matches('[data-time-picker]') && evento.key === 'ArrowDown') {
            evento.preventDefault();
            abrir(evento.target);
            panel?.querySelector('[aria-selected="true"]')?.focus();
            return;
        }
        const opcion = evento.target.closest('[data-hour-part]');
        if (!opcion || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(evento.key)) return;
        evento.preventDefault();
        const opciones = [...opcion.parentElement.querySelectorAll('[data-hour-part]')];
        const indice = opciones.indexOf(opcion);
        let siguiente;
        if (evento.key === 'Home') siguiente = opciones[0];
        else if (evento.key === 'End') siguiente = opciones[opciones.length - 1];
        else siguiente = opciones[(indice + (evento.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length];
        elegir(siguiente);
        siguiente.focus();
    });
})();
