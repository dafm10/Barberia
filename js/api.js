// Peticiones reales a Django. El JWT se conserva solo durante esta sesión del navegador.
window.barberiaApi = (() => {
  // const baseUrl = "http://127.0.0.1:8000";
  const baseUrl = "https://proyecto-backend-g32.onrender.com";
  const api = {
    servicios: [],
    sedes: [],
    barberos: [],
    citas: [],
    historial: [],
    sedesDatos: [],
    sedesAdmin: [],
    barberosDatos: [],
    barberosAdmin: [],
    serviciosSedes: [],
    habilidades: [],
    horarios: [],
    bloqueos: [],
    perfil: null,
  };
  const disponibilidadCache = new Map();
  let token = sessionStorage.getItem("barberia.token") || "";

  function mensajeError(valor) {
    if (Array.isArray(valor)) return valor.map(mensajeError).join(" ");
    if (valor && typeof valor === "object") {
      return Object.entries(valor)
        .map(([campo, error]) => `${campo}: ${mensajeError(error)}`)
        .join(" · ");
    }
    return String(valor ?? "");
  }

  async function peticion(ruta, opciones = {}) {
    let respuesta;
    try {
      respuesta = await fetch(`${baseUrl}${ruta}`, {
        ...opciones,
        headers: {
          ...(opciones.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new Error(
        "No se pudo conectar con Django. Revisa que esté en el puerto 8000 y abre el frontend con Live Server en el puerto 5500 o 5501.",
      );
    }
    const datos =
      respuesta.status === 204
        ? null
        : await respuesta.json().catch(() => null);
    if (respuesta.status === 401) cerrarSesion();
    if (!respuesta.ok) {
      const error = new Error(
        mensajeError(
          datos?.content ||
            datos?.detail ||
            datos?.message ||
            datos ||
            `Error HTTP ${respuesta.status}`,
        ),
      );
      error.status = respuesta.status;
      const detalles = datos?.content || datos;
      error.campos =
        detalles &&
        typeof detalles === "object" &&
        !Array.isArray(detalles) &&
        !detalles.message &&
        !detalles.detail
          ? detalles
          : null;
      throw error;
    }
    return datos;
  }

  async function listar(ruta) {
    const registros = [];
    let pagina = 1;
    let respuesta;
    do {
      respuesta = await peticion(
        `${ruta}${ruta.includes("?") ? "&" : "?"}pagina=${pagina}&cantidad=10`,
      );
      registros.push(...(respuesta.content || []));
      pagina++;
    } while (respuesta.paginacion?.siguiente);
    return registros;
  }

  function partesFecha(valor) {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(valor));
    const obtener = (tipo) => partes.find((parte) => parte.type === tipo).value;
    return {
      fecha: `${obtener("year")}-${obtener("month")}-${obtener("day")}`,
      hora: `${obtener("hour")}:${obtener("minute")}`,
    };
  }

  function normalizarCita(cita) {
    return {
      ...cita,
      ...partesFecha(cita.fecha_hora_inicio),
      codigo: cita.codigo_cita,
      nombre: cita.nombre_contacto,
      sede: api.sedesDatos.findIndex((sede) => sede.id === cita.sede_id),
      servicio: api.servicios.findIndex(
        (servicio) => servicio.id === cita.servicio_id,
      ),
      barbero: cita.barbero_id,
    };
  }

  async function cargarDatos() {
    const [sedes, servicios, serviciosSedes, barberos, habilidades] =
      await Promise.all([
        listar("/sedes"),
        listar("/servicios"),
        listar("/servicios-sedes"),
        listar("/barberos"),
        listar("/barberos-servicios"),
      ]);
    api.sedesDatos = sedes;
    api.sedes = sedes.map((sede) => sede.nombre);
    api.servicios = servicios;
    api.serviciosSedes = serviciosSedes;
    api.barberosDatos = barberos;
    api.barberos = sedes.map((sede) =>
      barberos
        .filter((barbero) => barbero.sede === sede.id)
        .map((barbero) => barbero.id),
    );
    api.habilidades = habilidades;
    api.citas = [];
    api.historial = [];
    api.horarios = [];
    api.bloqueos = [];
    api.sedesAdmin = [];
    api.barberosAdmin = [];
    disponibilidadCache.clear();
    if (token) {
      api.perfil = await peticion("/perfil");
      api.citas = (await listar("/citas")).map(normalizarCita);
      if (api.perfil.rol === "administrador") {
        [api.sedesAdmin, api.barberosAdmin] = await Promise.all([
          listar("/sedes?incluir_inactivas=true"),
          listar("/barberos?incluir_inactivos=true"),
        ]);
      }
      if (api.perfil.rol !== "cliente") {
        [api.horarios, api.bloqueos] = await Promise.all([
          listar("/horarios-barberos"),
          listar("/bloqueos-agenda"),
        ]);
        if (api.perfil.rol === "barbero") {
          api.horarios = api.horarios.filter(
            (item) => item.barbero === api.perfil.barbero_id,
          );
        }
      }
    }
  }

  async function cargarHistorial(id) {
    api.historial = await listar(`/cita/${id}/historial`);
  }

  function precio(servicio, sede) {
    const relacion = api.serviciosSedes.find(
      (item) =>
        item.sede === api.sedesDatos[sede]?.id &&
        item.servicio === api.servicios[servicio]?.id &&
        item.disponible,
    );
    return relacion ? Number(relacion.precio) : null;
  }

  function claveDisponibilidad(fecha, barbero, servicio, sede) {
    return [fecha, barbero, servicio, sede].join("|");
  }

  function disponibles(fecha, barbero, servicio, sede) {
    return (
      disponibilidadCache.get(
        claveDisponibilidad(fecha, barbero, servicio, sede),
      ) || []
    );
  }

  async function cargarDisponibilidad(fecha, barbero, servicio, sede) {
    if (!barbero || !api.servicios[servicio] || !api.sedesDatos[sede]) return;
    const parametros = new URLSearchParams({
      fecha,
      barbero,
      servicio: api.servicios[servicio].id,
      sede: api.sedesDatos[sede].id,
    });
    const resultado = await listar(`/disponibilidad?${parametros}`);
    disponibilidadCache.set(
      claveDisponibilidad(fecha, barbero, servicio, sede),
      resultado,
    );
  }

  async function crearCita(datos) {
    const respuesta = await peticion("/citas", {
      method: "POST",
      body: JSON.stringify({
        sede: api.sedesDatos[datos.sede].id,
        barbero: datos.barbero,
        servicio: api.servicios[datos.servicio].id,
        nombre_contacto: datos.nombre,
        email_contacto: datos.correo,
        telefono_contacto: datos.telefono,
        fecha_hora_inicio: `${datos.fecha}T${datos.hora}:00-05:00`,
      }),
    });
    const cita = normalizarCita(respuesta.content);
    api.citas.push(cita);
    disponibilidadCache.clear();
    return cita;
  }

  async function ejecutarAccionCita(id, accion, datos = {}) {
    const respuesta = await peticion(`/cita/${id}/${accion}`, {
      method: "PATCH",
      body: JSON.stringify(datos),
    });
    const resultado = normalizarCita(respuesta.content);
    const cita = api.citas.find((item) => item.id === id);
    if (cita) Object.assign(cita, resultado);
    disponibilidadCache.clear();
    return cita || resultado;
  }

  async function cambiarEstado(id, estado) {
    await ejecutarAccionCita(
      id,
      estado === "confirmada" ? "confirmar" : "cancelar",
    );
    await cargarHistorial(id);
  }

  async function responderReprogramacion(id, aceptada, razon) {
    return ejecutarAccionCita(id, "responder-reprogramacion", {
      aceptada,
      razon,
    });
  }

  async function marcarNoAsistio(id, razon) {
    return ejecutarAccionCita(id, "no-asistio", { razon });
  }

  async function completarCita(id) {
    return ejecutarAccionCita(id, "completar");
  }

  async function crearSede(datos) {
    return peticion("/sedes", { method: "POST", body: JSON.stringify(datos) });
  }

  async function eliminarSede(id) {
    return peticion(`/sede/${id}`, { method: "DELETE" });
  }

  async function actualizarSede(id, datos) {
    return peticion(`/sede/${id}`, {
      method: "PATCH",
      body: JSON.stringify(datos),
    });
  }

  async function crearBarbero(datos) {
    return peticion("/registro-barbero", {
      method: "POST",
      body: JSON.stringify(datos),
    });
  }

  async function actualizarBarbero(id, datos) {
    return peticion(`/barbero/${id}`, {
      method: "PATCH",
      body: JSON.stringify(datos),
    });
  }

  async function eliminarBarbero(id) {
    return peticion(`/barbero/${id}`, { method: "DELETE" });
  }

  async function guardarHorario(barbero, datos, id) {
    const ruta = id ? `/horario-barbero/${id}` : "/horarios-barberos";
    return peticion(ruta, {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(id ? datos : { ...datos, barbero }),
    });
  }

  async function eliminarHorario(id) {
    return peticion(`/horario-barbero/${id}`, { method: "DELETE" });
  }

  function fechaHoraFormulario(valor) {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(valor));
    const obtener = (tipo) => partes.find((parte) => parte.type === tipo).value;
    return `${obtener("year")}-${obtener("month")}-${obtener("day")}T${obtener("hour")}:${obtener("minute")}:${obtener("second")}`;
  }

  async function guardarBloqueo(barbero, datos, id) {
    const anterior = api.bloqueos.find((item) => item.id === id);
    const cuerpo = { motivo: datos.motivo };
    for (const campo of ["fecha_hora_inicio", "fecha_hora_fin"]) {
      if (!anterior || datos[campo] !== fechaHoraFormulario(anterior[campo])) {
        const valor =
          datos[campo].length === 16 ? `${datos[campo]}:00` : datos[campo];
        cuerpo[campo] = `${valor}-05:00`;
      }
    }
    if (!id) cuerpo.barbero = barbero;
    return peticion(id ? `/bloqueo-agenda/${id}` : "/bloqueos-agenda", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(cuerpo),
    });
  }

  async function eliminarBloqueo(id) {
    return peticion(`/bloqueo-agenda/${id}`, { method: "DELETE" });
  }

  async function guardarServicioSede(datos) {
    const existente = api.serviciosSedes.find(
      (item) => item.sede === datos.sede && item.servicio === datos.servicio,
    );
    const ruta = existente
      ? `/servicio-sede/${existente.id}`
      : "/servicios-sedes";
    return peticion(ruta, {
      method: existente ? "PATCH" : "POST",
      body: JSON.stringify(datos),
    });
  }

  async function crearServicio(datos) {
    return peticion("/servicios", {
      method: "POST",
      body: JSON.stringify(datos),
    });
  }

  async function registrarUsuario(datos) {
    return peticion("/registro", {
      method: "POST",
      body: JSON.stringify({
        nombre: datos.nombre,
        correo: datos.correo,
        telefono: datos.telefono,
        sexo: datos.sexo,
        password: datos.password,
      }),
    });
  }

  async function iniciarSesion(correo, password) {
    cerrarSesion();
    const respuesta = await peticion("/login", {
      method: "POST",
      body: JSON.stringify({ correo, password }),
    });
    token = respuesta.token;
    try {
      await cargarDatos();
      sessionStorage.setItem("barberia.token", token);
    } catch (error) {
      cerrarSesion();
      throw error;
    }
  }

  function cerrarSesion() {
    token = "";
    sessionStorage.removeItem("barberia.token");
    api.citas = [];
    api.historial = [];
    api.perfil = null;
    api.sedesAdmin = [];
    api.barberosAdmin = [];
    disponibilidadCache.clear();
  }

  function nombreBarbero(id) {
    return (
      api.barberosDatos.find((barbero) => barbero.id === id)?.nombre ||
      "Barbero"
    );
  }

  return Object.assign(api, {
    precio,
    disponibles,
    crearCita,
    cambiarEstado,
    responderReprogramacion,
    marcarNoAsistio,
    completarCita,
    cargarDatos,
    cargarHistorial,
    iniciarSesion,
    cerrarSesion,
    registrarUsuario,
    crearSede,
    actualizarSede,
    eliminarSede,
    crearBarbero,
    actualizarBarbero,
    eliminarBarbero,
    guardarServicioSede,
    crearServicio,
    guardarHorario,
    eliminarHorario,
    guardarBloqueo,
    eliminarBloqueo,
    fechaHoraFormulario,
    nombreBarbero,
    cargarDisponibilidad,
    fechaLocal: (fecha) => partesFecha(fecha || new Date()).fecha,
    tieneSesion: () => Boolean(token),
  });
})();
