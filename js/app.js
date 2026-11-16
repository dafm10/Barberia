(() => {
    const api = window.barberiaApi;
    const formularios = window.formularios;
    const root = document.getElementById('barber-prototype');
    const buscar = selector => root.querySelector(selector);
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    if (manana.getDay() === 0) manana.setDate(manana.getDate() + 1);

    const estado = {
        paso: 0,
        servicio: 0,
        sede: 0,
        barbero: '',
        fecha: api.fechaLocal(manana),
        hora: '',
        vista: 'reserve',
        seccion: 'agenda',
        sedeEdicion: '',
        barberoEdicion: '',
        barberoAgenda: '',
        horarioEdicion: '',
        bloqueoEdicion: '',
        cita: null,
        accionCita: null,
        login: false,
        registro: false
    };

    let ultimaDisponibilidad = '';
    const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const etiquetas = {
        pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada',
        completada: 'Completada', completado: 'Completada', no_asistio: 'No asistió',
        pendiente_reprogramacion: 'Pendiente de aceptar nuevo horario'
    };

    function escapar(texto) {
        const elemento = document.createElement('span');
        elemento.textContent = texto;
        return elemento.innerHTML;
    }

    function atributo(texto) {
        return escapar(texto).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }

    function fechaBonita(fecha) {
        return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
    }

    function mostrarError(mensaje = '') {
        buscar('#bp-error').hidden = !mensaje;
        buscar('#bp-error').textContent = mensaje;
    }

    function actualizarHoras() {
        const clave = [estado.fecha, estado.barbero, estado.servicio, estado.sede].join('|');
        if (clave !== ultimaDisponibilidad && estado.barbero && estado.servicio >= 0) {
            ultimaDisponibilidad = clave;
            estado.hora = '';
            buscar('#bp-slots').innerHTML = '';
            buscar('[data-screen="1"] .note').textContent = 'Consultando horarios disponibles…';
            api.cargarDisponibilidad(estado.fecha, estado.barbero, estado.servicio, estado.sede).then(() => {
                if (clave === ultimaDisponibilidad && estado.vista === 'reserve' && !estado.login && !estado.registro) renderizar();
            }).catch(error => mostrarError(error.message));
            return;
        }
        const turnos = api.disponibles(estado.fecha, estado.barbero, estado.servicio, estado.sede);
        if (!turnos.some(turno => turno.hora === estado.hora && turno.disponible)) {
            estado.hora = turnos.find(turno => turno.disponible)?.hora || '';
        }
        buscar('#bp-slots').innerHTML = turnos.map(turno => `
            <button type="button" data-time="${turno.hora}"
                aria-pressed="${turno.hora === estado.hora}"
                class="${turno.hora === estado.hora ? 'active' : ''}"
                ${turno.disponible ? '' : 'disabled'}>${turno.hora}</button>
        `).join('');
        const nota = buscar('[data-screen="1"] .note');
        nota.textContent = estado.hora
            ? 'Hora de Lima · Los horarios atenuados están ocupados o fuera de disponibilidad.'
            : 'No hay horarios disponibles para este día. Selecciona otra fecha.';
    }

    function renderizar() {
        const rol = api.perfil?.rol;
        buscar('.navigation').hidden = false;
        buscar('#bp-login').hidden = !estado.login || estado.registro;
        buscar('#bp-register').hidden = !estado.registro;
        buscar('#bp-openregister').hidden = Boolean(rol);
        buscar('#bp-openlogin').hidden = Boolean(rol);
        buscar('#bp-logout').hidden = !rol;
        const usuario = api.perfil?.content;
        buscar('#bp-user').hidden = !rol;
        buscar('#bp-user-name').textContent = usuario
            ? [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') : '';
        buscar('#bp-user-role').textContent = {
            administrador: 'Administrador', barbero: 'Barbero', cliente: 'Cliente'
        }[rol] || '';
        buscar('[data-view="admin"]').hidden = !rol;
        buscar('[data-view="admin"]').textContent = rol === 'cliente' ? 'Mis citas' : rol === 'barbero' ? 'Mi agenda' : 'Administración';
        buscar('[data-view="reserve"]').hidden = rol === 'barbero';
        buscar('[data-admin="availability"]').hidden = !rol || rol === 'cliente';
        buscar('[data-admin="services"]').hidden = rol !== 'administrador';
        buscar('[data-admin="catalog"]').hidden = rol !== 'administrador';
        buscar('[data-admin="team"]').hidden = rol !== 'administrador';
        buscar('[data-admin="sedes"]').hidden = rol !== 'administrador';
        buscar('#bp-admin .intro h1').textContent = rol === 'cliente' ? 'Tus próximas visitas.' : rol === 'barbero' ? 'Tu agenda de atención.' : 'Todo listo para atender.';
        buscar('#bp-admin .intro p').textContent = rol === 'cliente' ? 'Consulta tus reservas y su estado.' : rol === 'barbero' ? 'Consulta las citas asignadas a tu cuenta.' : 'Citas, equipo y disponibilidad en un solo lugar.';
        buscar('#bp-next').textContent = ['Elegir horario →', 'Continuar →', 'Solicitar reserva →'][estado.paso];
        const serviciosActivos = api.servicios.map((servicio, indice) => indice)
            .filter(indice => api.precio(indice, estado.sede) !== null);
        if (!serviciosActivos.includes(estado.servicio)) estado.servicio = serviciosActivos[0] ?? -1;
        const equipo = (api.barberos[estado.sede] || []).filter(id => api.habilidades.some(
            item => item.barbero === id && item.servicio === api.servicios[estado.servicio]?.id
        ));
        if (!equipo.includes(estado.barbero)) estado.barbero = equipo[0] || '';
        buscar('#bp-next').disabled = !api.sedes.length || estado.servicio < 0 || !estado.barbero;
        buscar('#bp-sede').innerHTML = api.sedesDatos.map((sede, indice) =>
            `<option value="${indice}">${escapar(sede.nombre)} · ${escapar(sede.direccion)}</option>`
        ).join('');
        buscar('#bp-reserve').hidden = estado.login || estado.registro || estado.vista !== 'reserve';
        buscar('#bp-admin').hidden = estado.login || estado.registro || estado.vista !== 'admin';
        root.querySelectorAll('[data-view]').forEach(boton => {
            boton.classList.toggle('active', boton.dataset.view === estado.vista);
            boton.setAttribute('aria-pressed', boton.dataset.view === estado.vista);
        });
        root.querySelectorAll('[data-screen]').forEach(pantalla => {
            pantalla.hidden = Boolean(estado.cita) || Number(pantalla.dataset.screen) !== estado.paso;
        });
        root.querySelectorAll('[data-step]').forEach(paso => {
            paso.classList.toggle('current', Number(paso.dataset.step) === estado.paso);
        });
        buscar('#bp-receipt').hidden = !estado.cita;
        buscar('#bp-showagenda').hidden = !api.perfil;
        buscar('#bp-guest-options').hidden = Boolean(api.perfil);
        buscar('#bp-actions').hidden = Boolean(estado.cita);
        buscar('#bp-back').hidden = estado.paso === 0;
        buscar('#bp-helper').textContent = `0${estado.paso + 1} / 03`;
        buscar('#bp-next').textContent = ['Elegir horario →', 'Continuar →', 'Solicitar reserva →'][estado.paso];
        buscar('#bp-sede').value = estado.sede;
        buscar('#bp-barber').innerHTML = equipo
            .map(id => `<option value="${id}">${escapar(api.nombreBarbero(id))}</option>`).join('');
        buscar('#bp-barber').value = estado.barbero;
        buscar('#bp-date').value = estado.fecha;
        buscar('#bp-date').min = api.fechaLocal();

        buscar('#bp-services').innerHTML = api.servicios.map((servicio, indice) => api.precio(indice, estado.sede) === null ? '' : `
            <button class="choice" type="button" data-service="${indice}"
                aria-pressed="${estado.servicio === indice}">
                <span class="icon" aria-hidden="true">✂</span>
                <strong>${escapar(servicio.nombre)}</strong>
                <small>${escapar(servicio.descripcion || '')}</small>
                <span class="price"><span>S/ ${api.precio(indice, estado.sede).toFixed(2)}</span>
                <small>${servicio.duracion} min</small></span>
            </button>
        `).join('');
        if (!estado.cita && estado.paso > 0 && !estado.login && !estado.registro && estado.vista === 'reserve') actualizarHoras();

        const servicio = api.servicios[estado.servicio];
        const importe = api.precio(estado.servicio, estado.sede);
        buscar('#bp-summary-sede').textContent = api.sedes[estado.sede] || 'Sin sedes activas';
        buscar('#bp-summary-service').textContent = servicio?.nombre || 'Sin servicios disponibles';
        buscar('#bp-summary-barber').textContent = estado.paso > 0 && estado.barbero ? api.nombreBarbero(estado.barbero) : 'Por elegir';
        buscar('#bp-summary-date').textContent = estado.paso > 0 && estado.hora
            ? `${fechaBonita(estado.fecha)} · ${estado.hora}` : 'Por elegir';
        buscar('#bp-total').textContent = importe === null ? '—' : `S/ ${importe.toFixed(2)}`;
        buscar('#bp-duration').textContent = servicio ? `${servicio.duracion} minutos de atención` : 'Configura los servicios de la sede';
        if (estado.cita) {
            buscar('#bp-code').textContent = estado.cita.codigo;
            buscar('#bp-receipt-status').textContent = etiquetas[estado.cita.estado];
            buscar('#bp-receipt h2').textContent = {
                cancelada: 'Tu cita fue cancelada.', confirmada: 'Tu cita está confirmada.',
                completada: 'Atención completada.', no_asistio: 'Inasistencia registrada.',
                pendiente_reprogramacion: 'Tienes un nuevo horario por aceptar.'
            }[estado.cita.estado] || 'Tu solicitud está registrada.';
        }
        renderizarAdministracion();
    }

    function renderizarAdministracion() {
        root.querySelectorAll('[data-admin]').forEach(boton => {
            boton.classList.toggle('active', boton.dataset.admin === estado.seccion);
        });
        const area = buscar('#bp-admincontent');
        if (estado.seccion === 'availability' && api.perfil?.rol === 'administrador') {
            const barbero = api.barberosAdmin.find(item => item.id === estado.barberoAgenda) || api.barberosAdmin[0];
            estado.barberoAgenda = barbero?.id || '';
            area.innerHTML = `<h2>Horarios y bloqueos</h2><div class="field" style="max-width:420px">
                <label for="bp-agenda-barber">Barbero</label><select id="bp-agenda-barber">${api.barberosAdmin.map(item => `<option value="${item.id}" ${item.id === estado.barberoAgenda ? 'selected' : ''}>${escapar(item.nombre)}${item.activo ? '' : ' (inactivo)'}</option>`).join('')}</select></div><div id="bp-barber-agenda">${panelAgendaBarbero(barbero)}</div>`;
            return;
        }
        if (estado.seccion === 'availability') {
            const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            area.innerHTML = `<h2>Horarios y bloqueos</h2><div class="tablewrap"><table>
                <thead><tr><th>Barbero</th><th>Horario semanal</th><th>Bloqueos</th></tr></thead>
                <tbody>${api.barberosDatos.map(barbero => `<tr><td>${escapar(barbero.nombre)}</td>
                <td>${api.horarios.filter(item => item.barbero === barbero.id).map(item =>
                    `${dias[item.dia_semana]} · ${item.hora_inicio}–${item.hora_fin}`
                ).join('<br>') || 'Sin horario'}</td>
                <td>${api.bloqueos.filter(item => item.barbero === barbero.id).map(item =>
                    `${escapar(new Date(item.fecha_hora_inicio).toLocaleString('es-PE', {timeZone:'America/Lima'}))} · ${escapar(item.motivo)}`
                ).join('<br>') || 'Sin bloqueos'}</td></tr>`).join('')}</tbody></table></div>`;
            return;
        }
        if (estado.seccion === 'sedes' && api.perfil?.rol === 'administrador') {
            const sede = api.sedesAdmin.find(item => item.id === estado.sedeEdicion);
            area.innerHTML = `<div class="actions" style="margin:0 0 20px"><h2>Información de las sedes</h2>
                <button type="button" class="primary" id="bp-new-sede">Nueva sede</button></div>
                <div class="tablewrap"><table><thead><tr><th>Sede</th><th>Dirección</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>${api.sedesAdmin.map(item => `<tr>
                    <td>${escapar(item.nombre)}</td><td>${escapar(item.direccion)}</td>
                    <td>${escapar(item.telefono || 'Sin teléfono')}</td><td><span class="badge">${item.activo ? 'Activa' : 'Inactiva'}</span></td>
                    <td><button type="button" class="compact" data-edit-sede="${item.id}">Editar</button>
                    ${item.activo ? `<button type="button" class="compact" data-delete-sede="${item.id}" aria-label="Eliminar sede ${atributo(item.nombre)}">Eliminar</button>` : ''}</td>
                </tr>`).join('')}</tbody></table></div>
                <p class="note">Eliminar desactiva la sede. Puedes reactivarla desde Editar.</p>
                ${api.sedesAdmin.length ? '' : '<p class="note">Crea tu primera sede con el formulario.</p>'}
                <form novalidate id="bp-save-sede" style="margin-top:28px;max-width:640px">
                    <h2>${sede ? 'Editar sede' : 'Crear una sede'}</h2>
                    <div class="field"><label for="bp-sede-name">Nombre</label><input id="bp-sede-name" name="nombre" maxlength="100" value="${atributo(sede?.nombre || '')}" required></div>
                    <div class="field"><label for="bp-sede-address">Dirección</label><input id="bp-sede-address" name="direccion" value="${atributo(sede?.direccion || '')}" required></div>
                    <div class="field"><label for="bp-sede-phone">Teléfono (opcional)</label><input id="bp-sede-phone" name="telefono" type="tel" maxlength="20" value="${atributo(sede?.telefono || '')}"></div>
                    <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><input type="checkbox" name="activo" style="width:auto" ${!sede || sede.activo ? 'checked' : ''}>Sede activa</label>
                    <p class="note" style="margin-bottom:18px">Las sedes inactivas dejan de ofrecer nuevas reservas. Puedes reactivarlas desde este panel.</p>
                    <div class="actions"><button type="button" id="bp-new-sede-bottom">Limpiar formulario</button><button type="submit" class="primary">${sede ? 'Guardar cambios' : 'Crear sede'}</button></div>
                </form>`;
            return;
        }
        if (estado.seccion === 'team' && api.perfil?.rol === 'administrador') {
            const barbero = api.barberosAdmin.find(item => item.id === estado.barberoEdicion);
            if (barbero) estado.barberoAgenda = barbero.id;
            const sedes = api.sedesAdmin.filter(sede => sede.activo || sede.id === barbero?.sede);
            const sexos = ['M', 'F', 'Otro', 'No especificado'];
            if (barbero?.sexo && !sexos.includes(barbero.sexo)) sexos.push(barbero.sexo);
            area.innerHTML = `<div class="actions" style="margin:0 0 20px"><h2>Equipo de barberos</h2>
                <button type="button" class="primary" id="bp-new-barber">Nuevo barbero</button></div>
                <div class="tablewrap"><table><thead><tr><th>Barbero</th><th>Sede</th><th>Servicios</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>${api.barberosAdmin.map(item => `<tr>
                <td>${escapar(item.nombre)} ${escapar(item.apellido || '')}<small>${escapar(item.correo)}</small><small>${escapar(item.telefono)}</small></td>
                <td>${escapar(api.sedesAdmin.find(sede => sede.id === item.sede)?.nombre || '')}</td>
                <td>${item.servicios.map(id => escapar(api.servicios.find(servicio => servicio.id === id)?.nombre || 'Servicio inactivo')).join(', ') || 'Sin servicios asignados'}</td>
                <td><span class="badge">${item.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td><button type="button" class="compact" data-edit-barber="${item.id}">Editar</button>
                ${item.activo ? `<button type="button" class="compact" data-delete-barber="${item.id}" aria-label="Eliminar barbero ${atributo(item.nombre)}">Eliminar</button>` : ''}</td>
                </tr>`).join('')}</tbody></table></div>
                <p class="note">Eliminar desactiva al barbero. Puedes reactivarlo desde Editar.</p>
                <form novalidate id="bp-create-barber" style="margin-top:28px;max-width:720px">
                    <h2>${barbero ? 'Editar barbero' : 'Registrar un nuevo barbero'}</h2>
                    <p class="note" style="margin-bottom:18px">${barbero ? 'Actualiza sus datos y asignaciones. Las citas pendientes pueden impedir cambios de sede o servicios.' : 'Se creará su cuenta y podrás asignar su horario inicial en este formulario.'}</p>
                    <div class="twocol">
                        <div class="field"><label for="bp-barber-name">Nombre</label><input id="bp-barber-name" name="nombre" value="${atributo(barbero?.nombre || '')}" required maxlength="150" autocomplete="off"></div>
                        <div class="field"><label for="bp-barber-lastname">Apellido (opcional)</label><input id="bp-barber-lastname" name="apellido" value="${atributo(barbero?.apellido || '')}" maxlength="150" autocomplete="off"></div>
                        <div class="field"><label for="bp-barber-email">Correo de acceso</label><input id="bp-barber-email" name="correo" value="${atributo(barbero?.correo || '')}" type="email" required maxlength="254" autocomplete="off"></div>
                        <div class="field"><label for="bp-barber-phone">Celular</label><input id="bp-barber-phone" name="telefono" value="${atributo(barbero?.telefono || '')}" type="tel" inputmode="numeric" pattern="[0-9]{9}" maxlength="9" required></div>
                        ${barbero ? '' : '<div class="field"><label for="bp-barber-password">Contraseña inicial</label><input id="bp-barber-password" name="password" type="password" autocomplete="new-password" minlength="8" required><small class="muted">Mínimo 8 caracteres.</small></div>'}
                        <div class="field"><label for="bp-barber-sex">Sexo</label><select id="bp-barber-sex" name="sexo" required><option value="">Selecciona</option>${sexos.map(sexo => `<option value="${atributo(sexo)}" ${barbero?.sexo === sexo ? 'selected' : ''}>${escapar({M:'Masculino',F:'Femenino'}[sexo] || sexo)}</option>`).join('')}</select></div>
                        <div class="field"><label for="bp-barber-sede">Sede asignada</label><select id="bp-barber-sede" name="sede" required><option value="">Selecciona una sede</option>${sedes.map(sede => `<option value="${sede.id}" ${sede.id === barbero?.sede ? 'selected' : ''}>${escapar(sede.nombre)}${sede.activo ? '' : ' (inactiva)'}</option>`).join('')}</select></div>
                    </div>
                    <fieldset style="border:0;padding:0;margin:0 0 20px"><legend>Servicios que realiza</legend>
                        <div class="twocol">${api.servicios.map(servicio => `<label style="display:flex;align-items:center;gap:8px;padding:8px 0"><input type="checkbox" name="servicios" value="${servicio.id}" ${barbero?.servicios.includes(servicio.id) ? 'checked' : ''} style="width:auto">${escapar(servicio.nombre)}</label>`).join('')}</div>
                    </fieldset>
                    ${barbero?.servicios.some(id => !api.servicios.some(servicio => servicio.id === id)) ? '<p class="note">Los servicios inactivos ya asignados se conservarán.</p>' : ''}
                    ${barbero ? '' : `<fieldset style="border:0;padding:0;margin:24px 0"><legend>Horario inicial (opcional)</legend>
                        <p class="note">Selecciona días y horas de atención. Podrás agregar más turnos y bloqueos al guardar.</p>
                        <div class="twocol">${diasSemana.map((dia, indice) => `<label style="display:flex;align-items:center;gap:8px;padding:8px 0"><input type="checkbox" name="horarios" value="${indice}" style="width:auto">${dia}</label>`).join('')}</div>
                        <div class="twocol"><div class="field"><label for="bp-initial-start">Hora de inicio</label><input id="bp-initial-start" name="hora_inicio" type="text" inputmode="text" data-time-picker placeholder="HH:MM:SS" maxlength="8" pattern="([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?" value="09:00"></div>
                        <div class="field"><label for="bp-initial-end">Hora de fin</label><input id="bp-initial-end" name="hora_fin" type="text" inputmode="text" data-time-picker placeholder="HH:MM:SS" maxlength="8" pattern="([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?" value="18:00"></div></div>
                    </fieldset>`}
                    ${barbero ? `<label style="display:flex;align-items:center;gap:8px;margin:12px 0"><input type="checkbox" name="activo" style="width:auto" ${barbero.activo ? 'checked' : ''}>Barbero activo</label>` : ''}
                    <button type="submit" class="primary" ${sedes.length && (barbero || api.servicios.length) ? '' : 'disabled'}>${barbero ? 'Guardar cambios del barbero' : 'Registrar barbero'}</button>
                    ${sedes.length ? '' : '<p class="note">Primero crea una sede.</p>'}
                </form>${barbero ? `<div id="bp-barber-agenda">${panelAgendaBarbero(barbero)}</div>` : ''}`;
            return;
        }
        if (estado.seccion === 'services' && api.perfil?.rol === 'administrador') {
            area.innerHTML = `<h2>Servicios creados</h2>
                <div class="tablewrap"><table>
                    <thead><tr><th>Nombre</th><th>Descripción</th><th>Duración</th></tr></thead>
                    <tbody>${api.servicios.map(servicio => `<tr>
                        <td>${escapar(servicio.nombre)}</td>
                        <td>${escapar(servicio.descripcion || 'Sin descripción')}</td>
                        <td>${escapar(String(servicio.duracion))} minutos</td>
                    </tr>`).join('')}</tbody>
                </table></div>
                ${api.servicios.length ? '' : '<p class="note">Todavía no hay servicios. Crea el primero con este formulario.</p>'}
                <form novalidate id="bp-create-service" style="margin-top:28px;max-width:640px">
                    <h2>Crear servicio</h2>
                    <div class="field"><label for="bp-service-name">Nombre</label><input id="bp-service-name" name="nombre" maxlength="100" required></div>
                    <div class="field"><label for="bp-service-description">Descripción (opcional)</label><textarea id="bp-service-description" name="descripcion" maxlength="300" rows="3"></textarea></div>
                    <div class="field"><label for="bp-service-duration">Duración en minutos</label><input id="bp-service-duration" name="duracion" type="number" min="1" max="2147483647" step="1" required></div>
                    <button type="submit" class="primary">Crear servicio</button>
                    <p class="note">Después de crearlo, asígnalo a una sede y configura su precio en Precios para ofrecer reservas.</p>
                </form>`;
            return;
        }
        if (estado.seccion === 'catalog' && api.perfil?.rol === 'administrador') {
            const precios = api.serviciosSedes.filter(item =>
                api.servicios.some(servicio => servicio.id === item.servicio) &&
                api.sedesDatos.some(sede => sede.id === item.sede));
            area.innerHTML = `${formulariosSedes()}<h2>Precios asignados</h2>
                <div class="tablewrap"><table>
                <thead><tr><th>Servicio</th><th>Sede</th><th>Precio</th><th>Disponibilidad</th><th>Acciones</th></tr></thead>
                <tbody>${precios.map(item => `<tr>
                    <td>${escapar(api.servicios.find(servicio => servicio.id === item.servicio).nombre)}</td>
                    <td>${escapar(api.sedesDatos.find(sede => sede.id === item.sede).nombre)}</td>
                    <td>S/ ${Number(item.precio).toFixed(2)}</td>
                    <td>${item.disponible ? 'Disponible' : 'No disponible'}</td>
                    <td><button type="button" class="compact" data-edit-price="${item.id}">Editar precio</button></td>
                </tr>`).join('')}</tbody></table></div>
                ${precios.length ? '' : '<p class="note">Todavía no hay precios asignados.</p>'}`;
            return;
        }
        area.innerHTML = `<div class="tablewrap"><table>
            <thead><tr><th>Horario</th><th>Cliente / cita</th><th>Servicio y barbero</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${api.citas.map(cita => `<tr>
            <td>${fechaBonita(cita.fecha)} · ${cita.hora}</td>
            <td>${escapar(cita.nombre)}<small>#${escapar(cita.codigo)}</small></td>
            <td>${escapar(cita.servicio_nombre)}<small>${escapar(cita.barbero_nombre)} · ${escapar(cita.sede_nombre)}</small></td>
            <td><span class="badge">${etiquetas[cita.estado] || escapar(cita.estado)}</span></td>
            <td>${api.perfil?.rol === 'administrador' && cita.estado === 'pendiente' ? `<button type="button" class="compact primary" data-confirm="${cita.id}">Confirmar</button>` : ''}
            ${api.perfil?.rol !== 'barbero' && ['pendiente', 'confirmada', 'pendiente_reprogramacion'].includes(cita.estado) ? `<button type="button" class="compact" data-cancel="${cita.id}">Cancelar</button>` : ''}
            ${accionesAdicionalesCita(cita)}
            <button type="button" class="compact" data-history="${cita.id}">Historial</button></td></tr>`).join('')}
            </tbody></table></div>
            ${api.citas.length ? '' : '<p class="adminnotice">Todavía no hay citas registradas.</p>'}
            <div id="bp-cita-action">${formularioAccionCita()}</div>
            <div class="history"><h2>Historial de la cita seleccionada</h2>
            ${api.historial.length ? api.historial.map(evento => `<p>${escapar(evento.accion)} · ${escapar(etiquetas[evento.estado_nuevo] || evento.estado_nuevo)}<br>
            <small>${escapar(evento.usuario_nombre)} · ${escapar(new Date(evento.fecha_creacion).toLocaleString('es-PE', {timeZone:'America/Lima'}))}</small></p>`).join('') : '<p class="muted">Selecciona Historial en una cita para consultar sus eventos.</p>'}</div>`;
    }

    function accionesAdicionalesCita(cita) {
        const rol = api.perfil?.rol;
        if (cita.estado === 'pendiente_reprogramacion' && ['cliente', 'administrador'].includes(rol)) {
            return `<button type="button" class="compact" data-appointment-action="respuesta" data-cita="${cita.id}">${rol === 'cliente' ? 'Responder nuevo horario' : 'Registrar respuesta del cliente'}</button>`;
        }
        if (rol === 'administrador' && cita.estado === 'confirmada' && new Date(cita.fecha_hora_fin).getTime() <= Date.now()) {
            return `<button type="button" class="compact primary" data-appointment-action="completar" data-cita="${cita.id}">Marcar completada</button>
                <button type="button" class="compact" data-appointment-action="ausencia" data-cita="${cita.id}">No asistió</button>`;
        }
        return '';
    }

    function formularioAccionCita() {
        const seleccion = estado.accionCita;
        const cita = api.citas.find(item => item.id === seleccion?.id);
        if (!cita) return '';
        const respuesta = seleccion.tipo === 'respuesta';
        const ausencia = seleccion.tipo === 'ausencia';
        const administrador = api.perfil?.rol === 'administrador';
        return `<form novalidate id="bp-cita-action-form" data-cita="${cita.id}" data-accion="${seleccion.tipo}" style="margin:24px 0;max-width:600px">
            <h2>${respuesta ? 'Responder al nuevo horario' : ausencia ? 'Registrar inasistencia' : 'Completar atención'}</h2>
            <p class="note" style="margin-bottom:16px">Cita #${escapar(cita.codigo)} · ${escapar(cita.nombre)} · ${escapar(fechaHoraTexto(cita.fecha_hora_inicio))}</p>
            ${respuesta ? `<div class="field"><label for="bp-response">Respuesta ${administrador ? 'comunicada por el cliente' : 'al horario propuesto'}</label>
                <select id="bp-response" name="aceptada" required><option value="">Selecciona</option>
                    <option value="true" ${new Date(cita.fecha_hora_inicio).getTime() <= Date.now() ? 'disabled' : ''}>Aceptar el nuevo horario</option>
                    <option value="false">Rechazar y cancelar la cita</option></select></div>
                <p class="note" style="margin-bottom:16px">Al aceptar, la cita queda confirmada. Al rechazar, queda cancelada.</p>` : ''}
            ${respuesta || ausencia ? `<div class="field"><label for="bp-action-reason">${respuesta && administrador ? 'Cómo se obtuvo la respuesta del cliente' : 'Observación (opcional)'}</label>
                <textarea id="bp-action-reason" name="razon" rows="2" ${respuesta && administrador ? 'required' : ''}></textarea></div>` : '<p class="note">Confirma que el servicio fue realizado antes de completar la atención.</p>'}
            <div class="actions"><button type="button" id="bp-close-cita-action">Cerrar</button>
                <button type="submit" class="primary">${respuesta ? 'Guardar respuesta' : ausencia ? 'Registrar que no asistió' : 'Confirmar atención completada'}</button></div>
        </form>`;
    }

    root.addEventListener('submit', async evento => {
        const formulario = evento.target;
        if (formulario.id !== 'bp-cita-action-form') return;
        evento.preventDefault();
        const boton = formulario.querySelector('button[type="submit"]');
        const razon = formulario.querySelector('[name="razon"]');
        if (razon) razon.value = razon.value.trim();
        if (boton.disabled || !formularios.validar(formulario)) return;
        const datos = new FormData(formulario);
        const id = formulario.dataset.cita;
        const accion = formulario.dataset.accion;
        let guardado = false;
        boton.disabled = true;
        const etiqueta = boton.textContent;
        boton.textContent = 'Guardando…';
        formulario.setAttribute('aria-busy', 'true');
        try {
            let cita;
            if (accion === 'respuesta') cita = await api.responderReprogramacion(id, datos.get('aceptada') === 'true', datos.get('razon') || '');
            else if (accion === 'ausencia') cita = await api.marcarNoAsistio(id, datos.get('razon') || '');
            else cita = await api.completarCita(id);
            guardado = true;
            if (estado.cita?.id === id) estado.cita = cita;
            let advertencia = '';
            try {
                await api.cargarHistorial(id);
            } catch (error) {
                advertencia = ` El cambio se guardó, pero no se pudo consultar el historial. ${error.message}`;
            }
            if (estado.accionCita?.id === id) estado.accionCita = null;
            ultimaDisponibilidad = '';
            renderizar();
            const aviso = document.createElement('p');
            aviso.className = 'form-feedback form-success';
            aviso.setAttribute('role', 'status');
            aviso.textContent = `Cita #${cita.codigo}: ${etiquetas[cita.estado] || cita.estado}.${advertencia}`;
            buscar('#bp-cita-action').append(aviso);
        } catch (error) {
            formularios.mostrarErrores(formulario, error);
        } finally {
            boton.disabled = guardado;
            boton.textContent = etiqueta;
            formulario.setAttribute('aria-busy', 'false');
        }
    });

    function actualizarPanelAgenda() {
        const panel = buscar('#bp-barber-agenda');
        if (!panel) return false;
        const barbero = api.barberosAdmin.find(item => item.id === estado.barberoAgenda);
        panel.innerHTML = panelAgendaBarbero(barbero);
        return true;
    }

    function panelAgendaBarbero(barbero) {
        if (!barbero) return '<p class="note">Selecciona un barbero para gestionar su agenda.</p>';
        const turnos = api.horarios.filter(item => item.barbero === barbero.id);
        const bloqueos = api.bloqueos.filter(item => item.barbero === barbero.id);
        const turno = turnos.find(item => item.id === estado.horarioEdicion);
        const bloqueo = bloqueos.find(item => item.id === estado.bloqueoEdicion);
        return `<section style="margin-top:30px" aria-label="Agenda de ${atributo(barbero.nombre)}">
            <h2>Horarios de ${escapar(barbero.nombre)}</h2>
            <p class="note">Puedes registrar varios turnos por día, por ejemplo mañana y tarde.</p>
            <div class="tablewrap"><table><thead><tr><th>Día</th><th>Inicio</th><th>Fin</th><th>Acciones</th></tr></thead>
            <tbody>${turnos.map(item => `<tr><td>${diasSemana[item.dia_semana]}</td><td>${item.hora_inicio}</td><td>${item.hora_fin}</td>
            <td><button type="button" class="compact" data-edit-schedule="${item.id}">Editar horario</button>
            <button type="button" class="compact" data-delete-schedule="${item.id}">Eliminar horario</button></td></tr>`).join('')}</tbody></table></div>
            ${turnos.length ? '' : '<p class="note">Este barbero todavía no tiene horarios de atención.</p>'}
            <form novalidate id="bp-schedule-form" data-barbero="${barbero.id}" data-registro="${turno?.id || ''}" style="margin-top:20px;max-width:720px">
                <h3>${turno ? 'Editar turno' : 'Agregar turno'}</h3>
                <div class="twocol">
                    <div class="field"><label for="bp-schedule-day">Día de la semana</label><select id="bp-schedule-day" name="dia_semana" required>${diasSemana.map((dia, indice) => `<option value="${indice}" ${indice === turno?.dia_semana ? 'selected' : ''}>${dia}</option>`).join('')}</select></div>
                    <div class="field"><label for="bp-schedule-start">Hora de inicio</label><input id="bp-schedule-start" name="hora_inicio" type="text" inputmode="text" data-time-picker placeholder="HH:MM:SS" maxlength="8" pattern="([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?" value="${turno?.hora_inicio || ''}" required></div>
                    <div class="field"><label for="bp-schedule-end">Hora de fin</label><input id="bp-schedule-end" name="hora_fin" type="text" inputmode="text" data-time-picker placeholder="HH:MM:SS" maxlength="8" pattern="([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?" value="${turno?.hora_fin || ''}" required></div>
                </div>
                <div class="actions"><button type="button" id="bp-new-schedule">Nuevo turno</button><button type="submit" class="primary" ${!turno && !barbero.activo ? 'disabled' : ''}>${turno ? 'Guardar turno' : 'Agregar turno'}</button></div>
            </form>
            <h2 style="margin-top:32px">Bloqueos de agenda</h2>
            <p class="note">Registra ausencias o períodos en los que el barbero no recibirá reservas.</p>
            <div class="tablewrap"><table><thead><tr><th>Inicio</th><th>Fin</th><th>Motivo</th><th>Acciones</th></tr></thead>
            <tbody>${bloqueos.map(item => `<tr><td>${escapar(fechaHoraTexto(item.fecha_hora_inicio))}</td><td>${escapar(fechaHoraTexto(item.fecha_hora_fin))}</td>
            <td>${escapar(item.motivo || 'Sin motivo')}</td><td><button type="button" class="compact" data-edit-block="${item.id}">Editar bloqueo</button>
            <button type="button" class="compact" data-delete-block="${item.id}">Eliminar bloqueo</button></td></tr>`).join('')}</tbody></table></div>
            ${bloqueos.length ? '' : '<p class="note">No hay bloqueos registrados para este barbero.</p>'}
            <form novalidate id="bp-block-form" data-barbero="${barbero.id}" data-registro="${bloqueo?.id || ''}" style="margin-top:20px;max-width:720px">
                <h3>${bloqueo ? 'Editar bloqueo' : 'Crear bloqueo'}</h3>
                <div class="twocol">
                    <div class="field"><label for="bp-block-start">Fecha y hora de inicio (Perú)</label><input id="bp-block-start" name="fecha_hora_inicio" type="datetime-local" step="1" value="${bloqueo ? api.fechaHoraFormulario(bloqueo.fecha_hora_inicio) : ''}" required></div>
                    <div class="field"><label for="bp-block-end">Fecha y hora de fin (Perú)</label><input id="bp-block-end" name="fecha_hora_fin" type="datetime-local" step="1" value="${bloqueo ? api.fechaHoraFormulario(bloqueo.fecha_hora_fin) : ''}" required></div>
                </div>
                <div class="field"><label for="bp-block-reason">Motivo (opcional)</label><textarea id="bp-block-reason" name="motivo" rows="2">${escapar(bloqueo?.motivo || '')}</textarea></div>
                <div class="actions"><button type="button" id="bp-new-block">Nuevo bloqueo</button><button type="submit" class="primary" ${!bloqueo && !barbero.activo ? 'disabled' : ''}>${bloqueo ? 'Guardar bloqueo' : 'Crear bloqueo'}</button></div>
            </form>
            ${barbero.activo ? '' : '<p class="note">Reactiva al barbero para agregar nuevos turnos o bloqueos.</p>'}
        </section>`;
    }

    function fechaHoraTexto(valor) {
        return new Date(valor).toLocaleString('es-PE', {timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short'});
    }

    function opcionesSedes() {
        return api.sedesDatos.map(sede => `<option value="${sede.id}">${escapar(sede.nombre)}</option>`).join('');
    }

    function formulariosSedes() {
        if (api.perfil?.rol !== 'administrador') return '';
        return `<div style="margin-bottom:30px;max-width:560px">
            <form novalidate id="bp-sede-service">
                <h2>Asignar precio a un servicio</h2>
                <p class="note">Cada servicio puede tener un precio diferente en cada sede.</p>
                <div class="field"><label for="bp-offer-sede">Sede</label><select id="bp-offer-sede" name="sede" required><option value="">Selecciona</option>${opcionesSedes()}</select></div>
                <div class="field"><label for="bp-offer-service">Servicio</label><select id="bp-offer-service" name="servicio" required><option value="">Selecciona</option>${api.servicios.map(servicio => `<option value="${servicio.id}">${escapar(servicio.nombre)}</option>`).join('')}</select></div>
                <div class="field"><label for="bp-offer-price">Precio (S/)</label><input id="bp-offer-price" name="precio" type="number" min="0.01" max="99999999.99" step="0.01" required></div>
                <button type="submit" class="primary" ${api.sedes.length && api.servicios.length ? '' : 'disabled'}>Guardar precio</button>
                <p class="note">Si la combinación ya existe, se actualiza su precio y queda disponible.</p>
                ${api.sedes.length ? '' : '<p class="note">Primero crea una sede en Sedes.</p>'}
                ${api.servicios.length ? '' : '<p class="note">Primero crea un servicio en Servicios.</p>'}
            </form>
        </div>`;
    }

    root.addEventListener('submit', async evento => {
        const formulario = evento.target;
        if (!['bp-schedule-form', 'bp-block-form'].includes(formulario.id)) return;
        evento.preventDefault();
        if (api.perfil?.rol !== 'administrador') return;
        const boton = formulario.querySelector('button[type="submit"]');
        if (boton.disabled || !formularios.validar(formulario)) return;
        const datos = new FormData(formulario);
        const esHorario = formulario.id === 'bp-schedule-form';
        const campoInicio = esHorario ? 'hora_inicio' : 'fecha_hora_inicio';
        const campoFin = esHorario ? 'hora_fin' : 'fecha_hora_fin';
        if (datos.get(campoFin) <= datos.get(campoInicio)) {
            formularios.marcarCampo(formulario.querySelector(`[name="${campoFin}"]`), 'El final debe ser posterior al inicio.');
            return;
        }
        const barbero = formulario.dataset.barbero;
        const id = formulario.dataset.registro;
        const etiqueta = boton.textContent;
        let guardado = false;
        let actualizado = false;
        boton.disabled = true;
        boton.textContent = 'Guardando…';
        formulario.setAttribute('aria-busy', 'true');
        try {
            if (esHorario) {
                await api.guardarHorario(barbero, {
                    dia_semana: Number(datos.get('dia_semana')),
                    hora_inicio: datos.get('hora_inicio'), hora_fin: datos.get('hora_fin')
                }, id);
            } else {
                await api.guardarBloqueo(barbero, {
                    fecha_hora_inicio: datos.get('fecha_hora_inicio'),
                    fecha_hora_fin: datos.get('fecha_hora_fin'), motivo: datos.get('motivo').trim()
                }, id);
            }
            guardado = true;
            await api.cargarDatos();
            actualizado = true;
            ultimaDisponibilidad = '';
            if (estado.barberoAgenda === barbero) {
                if (esHorario) estado.horarioEdicion = '';
                else estado.bloqueoEdicion = '';
            }
            if (actualizarPanelAgenda() && estado.barberoAgenda === barbero) formularios.notificar(buscar('#' + formulario.id), esHorario ? 'Horario guardado.' : 'Bloqueo guardado.', 'success');
        } catch (error) {
            if (guardado) formularios.notificar(formulario, `El registro se guardó. Vuelve a abrir la agenda para actualizar la pantalla. ${error.message}`);
            else formularios.mostrarErrores(formulario, error);
        } finally {
            boton.disabled = guardado && !actualizado;
            boton.textContent = etiqueta;
            formulario.setAttribute('aria-busy', 'false');
        }
    });

    root.addEventListener('submit', async evento => {
        const formulario = evento.target;
        if (!['bp-save-sede', 'bp-create-barber', 'bp-sede-service', 'bp-create-service'].includes(formulario.id)) return;
        evento.preventDefault();
        if (api.perfil?.rol !== 'administrador') return;
        const boton = formulario.querySelector('button[type="submit"]');
        if (boton.disabled) return;
        for (const campo of formulario.querySelectorAll('input:not([type="password"]):not([type="checkbox"])')) {
            campo.value = campo.value.trim();
        }
        if (!formularios.validar(formulario)) return;
        const datos = new FormData(formulario);
        const seleccionados = datos.getAll('servicios');
        const error = buscar('#bp-global-error');
        const exito = buscar('#bp-admin-success');
        error.hidden = true;
        exito.hidden = true;
        if (formulario.id === 'bp-create-barber' && !estado.barberoEdicion && !seleccionados.length) {
            const campo = formulario.querySelector('[name="servicios"]');
            if (campo) formularios.marcarCampo(campo, 'Selecciona al menos un servicio para el barbero.');
            else formularios.notificar(formulario, 'Primero registra un servicio para asignarlo.');
            return;
        }
        const diasIniciales = datos.getAll('horarios');
        if (formulario.id === 'bp-create-barber' && !estado.barberoEdicion && diasIniciales.length) {
            if (!datos.get('hora_inicio')) {
                formularios.marcarCampo(buscar('#bp-initial-start'), 'Indica la hora de inicio.');
                return;
            }
            if (!datos.get('hora_fin') || datos.get('hora_fin') <= datos.get('hora_inicio')) {
                formularios.marcarCampo(buscar('#bp-initial-end'), 'La hora final debe ser posterior a la inicial.');
                return;
            }
        }
        boton.disabled = true;
        const etiqueta = boton.textContent;
        boton.textContent = 'Guardando…';
        formulario.setAttribute('aria-busy', 'true');
        let guardado = false;
        try {
            let mensaje;
            if (formulario.id === 'bp-create-service') {
                await api.crearServicio({
                    nombre: datos.get('nombre'),
                    descripcion: datos.get('descripcion').trim() || null,
                    duracion: Number(datos.get('duracion')),
                    activo: true
                });
                mensaje = 'Servicio creado. Ya puedes asignarlo a una sede y configurar su precio.';
            } else if (formulario.id === 'bp-save-sede') {
                const id = estado.sedeEdicion;
                const informacion = {
                    nombre: datos.get('nombre'), direccion: datos.get('direccion'),
                    telefono: datos.get('telefono'), activo: datos.has('activo')
                };
                const respuesta = id ? await api.actualizarSede(id, informacion) : await api.crearSede(informacion);
                estado.sedeEdicion = respuesta.content.id;
                mensaje = id ? 'Información de la sede actualizada.' : 'Sede creada. Configura sus servicios y precios en Precios.';
            } else if (formulario.id === 'bp-create-barber') {
                const id = estado.barberoEdicion;
                const cuenta = {
                    nombre: datos.get('nombre'), apellido: datos.get('apellido'), correo: datos.get('correo'),
                    telefono: datos.get('telefono'), sexo: datos.get('sexo')
                };
                const actual = api.barberosAdmin.find(item => item.id === id);
                const inactivos = actual?.servicios.filter(valor => !api.servicios.some(servicio => servicio.id === valor)) || [];
                const informacion = {cuenta, sede: datos.get('sede'), servicios: [...seleccionados, ...inactivos]};
                if (id) {
                    informacion.activo = datos.has('activo');
                    await api.actualizarBarbero(id, informacion);
                    mensaje = 'Información del barbero actualizada.';
                } else {
                    cuenta.password = datos.get('password');
                    informacion.horarios = diasIniciales.map(dia => ({dia_semana: Number(dia), hora_inicio: datos.get('hora_inicio'), hora_fin: datos.get('hora_fin')}));
                    await api.crearBarbero(informacion);
                    mensaje = 'Barbero registrado. Pulsa Editar para completar sus datos, horarios y bloqueos.';
                }
                estado.barberoEdicion = '';
                estado.barberoAgenda = '';
                estado.horarioEdicion = '';
                estado.bloqueoEdicion = '';
            } else {
                await api.guardarServicioSede({sede: datos.get('sede'), servicio: datos.get('servicio'), precio: datos.get('precio'), disponible: true});
                mensaje = 'Servicio y precio guardados en la sede.';
            }
            guardado = true;
            formulario.reset();
            formularios.notificar(formulario, mensaje, 'success');
            await api.cargarDatos();
            ultimaDisponibilidad = '';
            renderizar();
            formularios.notificar(buscar('#' + formulario.id), mensaje, 'success');
        } catch (fallo) {
            if (guardado) formularios.notificar(formulario, `El registro se guardó, pero no se pudo actualizar la pantalla. ${fallo.message}`);
            else formularios.mostrarErrores(formulario, fallo);
        } finally {
            boton.disabled = false;
            boton.textContent = etiqueta;
            formulario.setAttribute('aria-busy', 'false');
        }
    });

    async function avanzar() {
        mostrarError();
        if (estado.paso === 1 && !buscar('#bp-date').checkValidity()) {
            buscar('#bp-date').focus();
            return;
        }
        if (estado.paso === 1 && !estado.hora) {
            formularios.marcarCampo(buscar('#bp-date'), 'No hay horarios disponibles para esta fecha. Selecciona otra.');
            return;
        }
        if (estado.paso < 2) {
            ultimaDisponibilidad = '';
            estado.paso++;
            return;
        }
        buscar('#bp-name').value = buscar('#bp-name').value.trim();
        if (!formularios.validar(buscar('#bp-contact'))) return;
        try {
            estado.cita = await api.crearCita({
                sede: estado.sede,
                servicio: estado.servicio,
                barbero: estado.barbero,
                fecha: estado.fecha,
                hora: estado.hora,
                nombre: buscar('#bp-name').value.trim(),
                correo: buscar('#bp-email').value.trim(),
                telefono: buscar('#bp-phone').value
            });
            ultimaDisponibilidad = '';
        } catch (error) {
            const campos = error.campos || {};
            if (campos.fecha_hora_inicio || campos.barbero) {
                estado.paso = 1;
                renderizar();
                if (campos.fecha_hora_inicio) formularios.marcarCampo(buscar('#bp-date'), campos.fecha_hora_inicio);
                if (campos.barbero) formularios.marcarCampo(buscar('#bp-barber'), campos.barbero);
            } else if (campos.sede || campos.servicio) {
                estado.paso = 0;
                renderizar();
                if (campos.sede) formularios.marcarCampo(buscar('#bp-sede'), campos.sede);
                if (campos.servicio) formularios.marcarCampo(buscar('#bp-services'), campos.servicio);
            } else {
                formularios.mostrarErrores(buscar('#bp-contact'), error, {
                    nombre_contacto: 'nombre', email_contacto: 'correo', telefono_contacto: 'telefono'
                });
            }
        }
    }

    root.addEventListener('click', async evento => {
        const boton = evento.target.closest('button');
        if (!boton || boton.disabled) return;
        if (boton.id === 'bp-logout') {
            api.cerrarSesion();
            estado.cita = null;
            estado.paso = 0;
            estado.vista = 'reserve';
            estado.login = false;
            buscar('#bp-contact').reset();
            try {
                await api.cargarDatos();
                mostrarAplicacion();
            } catch (error) {
                mostrarAplicacion();
                buscar('#bp-global-error').textContent = error.message;
                buscar('#bp-global-error').hidden = false;
            }
            return;
        }
        if (boton.type === 'submit') return;
        if (boton.dataset.editPrice && api.perfil?.rol === 'administrador') {
            const precio = api.serviciosSedes.find(item => item.id === boton.dataset.editPrice);
            if (!precio) return;
            buscar('#bp-offer-sede').value = precio.sede;
            buscar('#bp-offer-service').value = precio.servicio;
            buscar('#bp-offer-price').value = precio.precio;
            buscar('#bp-offer-price').focus();
            return;
        }
        boton.disabled = true;
        mostrarError();
        try {
            if (['bp-openregister', 'bp-login-register', 'bp-booking-register'].includes(boton.id)) {
                estado.registro = true;
                estado.login = false;
                buscar('#bp-auth-success').hidden = true;
            }
            else if (['bp-openlogin', 'bp-register-login', 'bp-booking-login'].includes(boton.id)) {
                estado.login = true;
                estado.registro = false;
                buscar('#bp-register-password').value = '';
                buscar('#bp-register-confirm').value = '';
                buscar('#bp-register-confirm').setCustomValidity('');
            }
            else if (boton.dataset.view) {
                if (!api.perfil && (estado.login || estado.registro)) estado.paso = 0;
                estado.login = false;
                estado.registro = false;
                estado.vista = boton.dataset.view;
                if (estado.vista === 'admin') {
                    const id = estado.cita?.id;
                    await api.cargarDatos();
                    if (id) estado.cita = api.citas.find(cita => cita.id === id) || null;
                }
            }
            else if (boton.dataset.admin) estado.seccion = boton.dataset.admin;
            else if (boton.id === 'bp-new-barber') estado.barberoEdicion = '';
            else if (boton.dataset.editBarber) {
                estado.barberoEdicion = boton.dataset.editBarber;
                estado.barberoAgenda = boton.dataset.editBarber;
                estado.horarioEdicion = '';
                estado.bloqueoEdicion = '';
            }
            else if (boton.dataset.editSchedule || boton.dataset.editBlock || ['bp-new-schedule', 'bp-new-block'].includes(boton.id)) {
                if (boton.dataset.editSchedule) estado.horarioEdicion = boton.dataset.editSchedule;
                else if (boton.dataset.editBlock) estado.bloqueoEdicion = boton.dataset.editBlock;
                else if (boton.id === 'bp-new-schedule') estado.horarioEdicion = '';
                else estado.bloqueoEdicion = '';
                actualizarPanelAgenda();
                return;
            }
            else if (boton.dataset.deleteSchedule || boton.dataset.deleteBlock) {
                const esHorario = Boolean(boton.dataset.deleteSchedule);
                const formulario = buscar(esHorario ? '#bp-schedule-form' : '#bp-block-form');
                try {
                    if (esHorario) await api.eliminarHorario(boton.dataset.deleteSchedule);
                    else await api.eliminarBloqueo(boton.dataset.deleteBlock);
                } catch (error) {
                    formularios.mostrarErrores(formulario, error);
                    return;
                }
                estado.horarioEdicion = '';
                estado.bloqueoEdicion = '';
                try {
                    await api.cargarDatos();
                } catch (error) {
                    formularios.notificar(formulario, `Se eliminó el registro, pero no se pudo actualizar la pantalla. ${error.message}`);
                    return;
                }
                ultimaDisponibilidad = '';
                if (actualizarPanelAgenda()) formularios.notificar(buscar(esHorario ? '#bp-schedule-form' : '#bp-block-form'), esHorario ? 'Horario eliminado.' : 'Bloqueo eliminado.', 'success');
                return;
            }
            else if (boton.dataset.deleteBarber && api.perfil?.rol === 'administrador') {
                await api.eliminarBarbero(boton.dataset.deleteBarber);
                buscar('#bp-admin-success').textContent = 'Barbero desactivado. Puedes reactivarlo desde Editar.';
                buscar('#bp-admin-success').hidden = false;
                try {
                    await api.cargarDatos();
                } catch (error) {
                    throw new Error(`El barbero se desactivó, pero no se pudo actualizar la pantalla. ${error.message}`);
                }
                ultimaDisponibilidad = '';
            }
            else if (boton.dataset.editSede) estado.sedeEdicion = boton.dataset.editSede;
            else if (boton.dataset.deleteSede && api.perfil?.rol === 'administrador') {
                const id = boton.dataset.deleteSede;
                await api.eliminarSede(id);
                const exito = buscar('#bp-admin-success');
                exito.textContent = 'Sede eliminada del catálogo activo. Puedes reactivarla desde Editar.';
                exito.hidden = false;
                try {
                    await api.cargarDatos();
                } catch (error) {
                    throw new Error(`La sede se desactivó, pero no se pudo actualizar la pantalla. ${error.message}`);
                }
                ultimaDisponibilidad = '';
            }
            else if (['bp-new-sede', 'bp-new-sede-bottom'].includes(boton.id)) estado.sedeEdicion = '';
            else if (boton.dataset.service !== undefined) {
                formularios.limpiarCampo(buscar('#bp-services'));
                estado.servicio = Number(boton.dataset.service);
            }
            else if (boton.dataset.time) estado.hora = boton.dataset.time;
            else if (boton.id === 'bp-next') await avanzar();
            else if (boton.id === 'bp-new') {
                estado.cita = null;
                estado.paso = 0;
                if (api.perfil?.rol !== 'cliente') buscar('#bp-contact').reset();
            }
            else if (boton.id === 'bp-back') estado.paso = Math.max(0, estado.paso - 1);
            else if (boton.id === 'bp-showagenda') {
                estado.vista = 'admin';
                estado.seccion = 'agenda';
            } else if (boton.dataset.confirm || boton.dataset.cancel) {
                const codigo = boton.dataset.confirm || boton.dataset.cancel;
                await api.cambiarEstado(codigo, boton.dataset.confirm ? 'confirmada' : 'cancelada');
                ultimaDisponibilidad = '';
            }
            else if (boton.dataset.appointmentAction) {
                estado.accionCita = {id: boton.dataset.cita, tipo: boton.dataset.appointmentAction};
                buscar('#bp-cita-action').innerHTML = formularioAccionCita();
                buscar('#bp-cita-action-form select, #bp-cita-action-form textarea, #bp-cita-action-form button[type="submit"]')?.focus();
                return;
            }
            else if (boton.id === 'bp-close-cita-action') {
                estado.accionCita = null;
                buscar('#bp-cita-action').innerHTML = '';
                return;
            }
            else if (boton.dataset.history) await api.cargarHistorial(boton.dataset.history);
            renderizar();
        } catch (error) {
            buscar('#bp-global-error').hidden = false;
            buscar('#bp-global-error').textContent = error.message;
            if (!api.tieneSesion()) {
                estado.login = true;
                renderizar();
            }
        } finally {
            boton.disabled = false;
            buscar('#bp-next').disabled = !api.sedes.length || estado.servicio < 0 || !estado.barbero;
        }
    });

    root.addEventListener('change', evento => {
        if (evento.target.id !== 'bp-agenda-barber') return;
        estado.barberoAgenda = evento.target.value;
        estado.horarioEdicion = '';
        estado.bloqueoEdicion = '';
        renderizar();
    });

    buscar('#bp-sede').addEventListener('change', evento => {
        estado.sede = Number(evento.target.value);
        estado.barbero = api.barberos[estado.sede]?.[0] || '';
        renderizar();
    });
    buscar('#bp-barber').addEventListener('change', evento => {
        estado.barbero = evento.target.value;
        renderizar();
    });
    buscar('#bp-date').addEventListener('change', evento => {
        if (evento.target.value && evento.target.validity.valid) {
            estado.fecha = evento.target.value;
            renderizar();
        } else {
            estado.hora = '';
            buscar('#bp-slots').innerHTML = '';
            formularios.marcarCampo(buscar('#bp-date'), 'Selecciona una fecha válida a partir de hoy.');
        }
    });
    buscar('#bp-contact').addEventListener('submit', evento => evento.preventDefault());
    function mostrarAplicacion() {
        estado.login = false;
        estado.registro = false;
        ultimaDisponibilidad = '';
        if (api.perfil?.rol === 'barbero') {
            estado.vista = 'admin';
            estado.seccion = 'agenda';
        }
        if (api.perfil?.rol !== 'administrador') estado.seccion = 'agenda';
        const cliente = api.perfil?.rol === 'cliente';
        const usuario = api.perfil?.content;
        for (const [selector, campo] of [['#bp-name', 'nombre'], ['#bp-email', 'correo'], ['#bp-phone', 'telefono']]) {
            buscar(selector).readOnly = cliente;
            if (cliente) buscar(selector).value = usuario[campo] || '';
        }
        buscar('#bp-contact-note').textContent = cliente
            ? 'La reserva utilizará tus datos de contacto. Si falta alguno, debes completarlo en tu cuenta.'
            : 'Puedes reservar sin crear una cuenta. Tu solicitud queda pendiente de confirmación.';
        renderizar();
    }

    const confirmarPassword = buscar('#bp-register-confirm');
    function validarConfirmacion() {
        const coincide = confirmarPassword.value === buscar('#bp-register-password').value;
        confirmarPassword.setCustomValidity(coincide ? '' : 'Las contraseñas deben coincidir.');
    }
    confirmarPassword.addEventListener('input', validarConfirmacion);
    buscar('#bp-register-password').addEventListener('input', validarConfirmacion);

    buscar('#bp-register-form').addEventListener('submit', async evento => {
        evento.preventDefault();
        const boton = buscar('#bp-register-submit');
        if (boton.disabled) return;
        const formulario = evento.currentTarget;
        buscar('#bp-register-name').value = buscar('#bp-register-name').value.trim();
        buscar('#bp-register-email').value = buscar('#bp-register-email').value.trim();
        validarConfirmacion();
        if (!formularios.validar(formulario)) return;
        const error = buscar('#bp-register-error');
        error.hidden = true;
        boton.disabled = true;
        boton.textContent = 'Creando cuenta…';
        formulario.setAttribute('aria-busy', 'true');
        const correo = buscar('#bp-register-email').value;
        try {
            await api.registrarUsuario({
                nombre: buscar('#bp-register-name').value,
                correo,
                telefono: buscar('#bp-register-phone').value,
                sexo: buscar('#bp-register-sex').value,
                password: buscar('#bp-register-password').value
            });
            formulario.reset();
            confirmarPassword.setCustomValidity('');
            buscar('#bp-login-email').value = correo;
            buscar('#bp-login-password').value = '';
            buscar('#bp-login-error').hidden = true;
            buscar('#bp-auth-success').hidden = true;
            estado.registro = false;
            estado.login = true;
            renderizar();
            formularios.notificar(buscar('#bp-login-form'), 'Tu cuenta fue creada. Inicia sesión para continuar con tu reserva.', 'success');
            buscar('#bp-login-password').focus();
        } catch (fallo) {
            formularios.mostrarErrores(formulario, fallo);
        } finally {
            boton.disabled = false;
            boton.textContent = 'Crear mi cuenta';
            formulario.setAttribute('aria-busy', 'false');
        }
    });

    buscar('#bp-login-form').addEventListener('submit', async evento => {
        evento.preventDefault();
        const formulario = evento.currentTarget;
        if (!formularios.validar(formulario)) return;
        const boton = buscar('#bp-login-submit');
        if (boton.disabled) return;
        const error = buscar('#bp-login-error');
        boton.disabled = true;
        boton.textContent = 'Conectando…';
        error.hidden = true;
        try {
            await api.iniciarSesion(buscar('#bp-login-email').value.trim(), buscar('#bp-login-password').value);
            buscar('#bp-login-password').value = '';
            mostrarAplicacion();
        } catch (fallo) {
            formularios.mostrarErrores(formulario, fallo);
        } finally {
            boton.disabled = false;
            boton.textContent = 'Ingresar';
        }
    });

    api.cargarDatos().then(mostrarAplicacion).catch(async error => {
        if (!api.tieneSesion()) {
            api.cerrarSesion();
            try {
                await api.cargarDatos();
                mostrarAplicacion();
            } catch {}
        }
        buscar('#bp-global-error').textContent = error.message;
        buscar('#bp-global-error').hidden = false;
    });
})();
