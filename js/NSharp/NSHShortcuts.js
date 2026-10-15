var atajos = (function () {
	var o = {};

	var AYUDA = [
		["Deshacer / Rehacer", "[Ctrl]+[Z]  /  [Ctrl]+[Y]"],
		["Copiar / Cortar / Pegar bloques", "[Ctrl]+[C]  /  [Ctrl]+[X]  /  [Ctrl]+[V]"],
		["Duplicar bloque", "[Ctrl]+[D]"],
		["Seleccionar todos los bloques", "[Ctrl]+[A]"],
		["Agregar a la selección", "[Ctrl]+[Click]  /  [Casilla]"],
		["Seleccionar un rango", "[Shift]+[Click]"],
		["Eliminar lo seleccionado", "[Supr]  o  [Backspace]"],
		["Quitar la selección", "[Esc]"],
		["Elegir varios métodos", "[Ctrl]+[Click] / [Shift]+[Click]"],
		["Buscar en el proyecto", "[Ctrl]+[F]"],
		["Nuevo método", "[Ctrl]+[N]"],
		["Renombrar el método actual", "[F2]"],
		["Cambiar de proyecto", "[Ctrl]+[Tab]  /  [Ctrl]+[1..8]"],
		["Cambiar entre la vista NS y la UML", "[Ctrl]+[Shift]+[U]"],
		["Guardar (.nsplus) / Abrir", "[Ctrl]+[S]  /  [Ctrl]+[O]"],
		["Zoom", "[Ctrl]+[Rueda]  o  [Pellizco]"],
		["Zoom 100% / Ajustar", "[Ctrl]+[0]  /  [Ctrl]+[9]"],
		["Mover el lienzo", "[Espacio]+[Arrastrar]  o  [Botón del medio]"],
		["Cambiar entre tema claro y oscuro", "[Ctrl]+[Shift]+[D]"],
		["Mostrar siempre las casillas", "[Ctrl]+[Shift]+[C]"],
		["Abrir esta ayuda", "[F1]"]
	];

	var AYUDA_UML = [
		["Deshacer / Rehacer", "[Ctrl]+[Z]  /  [Ctrl]+[Y]"],
		["Nueva clase / Nueva nota", "[C]  /  [N]"],
		["Relacionar: elegí el tipo y tocá las dos clases", "[1 a 7]"],
		["Relacionar con el último tipo elegido", "[R]"],
		["Seleccionar una zona", "Arrastrar sobre el fondo"],
		["Sumar o quitar de la selección", "[Ctrl]+[Click]  /  [Shift]+[Click]"],
		["Seleccionar todo", "[Ctrl]+[A]"],
		["Editar el texto de lo elegido", "[Enter]  o  [F2]"],
		["Mover lo elegido", "[Flechas]  ([Shift] = de a 1 px)"],
		["Pasar al siguiente elemento", "[Tab]  /  [Shift]+[Tab]"],
		["Duplicar lo elegido", "[Ctrl]+[D]  o  [Doble click]"],
		["Eliminar lo elegido", "[Supr]  o  [Backspace]"],
		["Abrir un .uxf de UMLet", "[Ctrl]+[O]  o  [Arrastralo]"],
		["Generar las clases en el proyecto", "[Ctrl]+[G]"],
		["Mover el plano", "[Espacio]+[Arrastrar]  o  [Botón del medio]"],
		["Zoom", "[Ctrl]+[Rueda]  o  [Pellizco]"],
		["Zoom 100% / Ver todo", "[Ctrl]+[0]  /  [Ctrl]+[9]"],
		["Cancelar o deseleccionar", "[Esc]"],
		["Agregar vértice a una flecha", "[Doble click] o [Shift]+[Click]"]
	];

	function tabla(filas) {
		return "<table>" + filas.map(function (x) {
			return "<tr><td>" + x[0] + "</td><td>" + x[1].replaceAll("[", "<kbd>").replaceAll("]" ,"</kbd>") + "</td></tr>";
		}).join("") + "</table>";
	}

	function cerrarAyuda() {
		var v = document.getElementById("nshHelp");
		if (v) { v.remove(); }
	}

	function ayuda() {
		if (document.getElementById("nshHelp")) { cerrarAyuda(); return; }
		var v = document.createElement("div");
		v.id = "nshHelp";
		v.innerHTML = '<div class="nsh-help-card">' +
			"<h3>Atajos de teclado de NS Sharp</h3>" +
			"<h4>Diagramas de Nassi-Shneiderman</h4>" +
			tabla(AYUDA) +
			"<h4>Diagrama de clases UML</h4>" +
			tabla(AYUDA_UML) +
			'<button type="button" class="nsh-help-close">Cerrar</button>' +
			"</div>";
		v.addEventListener("click", function (e) {
			if (e.target === v || e.target.classList.contains("nsh-help-close")) { cerrarAyuda(); }
		});
		document.body.appendChild(v);
	}

	function bloqueVacioBajoElCursor(t) {
		if (!t || !t.classList || !t.classList.contains("input-for-statement")) { return null; }
		if ((t.value || "") !== "") { return null; }
		var b = util.bloqueDe(t);
		return (b && util.estaVacio(b)) ? b : null;
	}

	function alApretar(e) {
		var escribiendo = util.escribiendo(e.target);
		var ctrl = e.ctrlKey || e.metaKey;
		var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
		var enUml = typeof uml !== "undefined" && uml.activo();
		var soloVer = typeof nube !== "undefined" && nube.soloLectura();

		if (k === "Escape") {
			if (document.getElementById("nshHelp")) { cerrarAyuda(); return; }
			if (document.getElementById("nshCredits")) { creditos.cerrar(); return; }
			if (menu.abierto()) { menu.cerrar(); return; }
			if (!escribiendo) {
				seleccion.limpiarSeleccion();
				arbol.limpiarSeleccion();
			}
			return;
		}

		if (k === "F1") { e.preventDefault(); ayuda(); return; }

		if (soloVer && !enUml && (k === "Delete" || k === "Backspace" || k === "F2" ||
			(ctrl && !e.shiftKey && k.length === 1 && "zyxvdn".indexOf(k) !== -1))) { return; }

		if (k === "F2" && !escribiendo && !enUml) {
			e.preventDefault();
			arbol.renombrarActual();
			return;
		}

		if (!enUml && (k === "Delete" || k === "Backspace")) {
			var vacio = bloqueVacioBajoElCursor(e.target);
			if (vacio) {
				e.preventDefault();
				seleccion.soloEste(vacio);
				seleccion.eliminarElegidos();
				return;
			}
		}

		if (!escribiendo && !enUml) {
			if (k === "Delete" || k === "Backspace") {
				if (!seleccion.vacia()) {
					e.preventDefault();
					seleccion.eliminarElegidos();
				} else if (arbol.cuantos()) {
					e.preventDefault();
					arbol.borrarElegidos();
				}
				return;
			}
			if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); historial.atras(); return; }
			if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); historial.adelante(); return; }
			if (ctrl && k === "a") { e.preventDefault(); seleccion.todos(); return; }
			if (ctrl && k === "c" && !e.shiftKey) {
   				 e.preventDefault();
   				 if (seleccion.vacia() && arbol.cuantos()) { arbol.copiarElegidos(); }
   				 else { seleccion.copiar(); }
  				  return;
				}
			if (ctrl && k === "x") { e.preventDefault(); seleccion.cortar(); return; }
			if (ctrl && k === "v") { seleccion.pedirPegar(null); return; }
			if (ctrl && k === "d" && !e.shiftKey) { e.preventDefault(); seleccion.duplicar(); return; }
		}

		if (ctrl && k === "f") { e.preventDefault(); buscador.abrir(); return; }
		if (ctrl && k === "s") { e.preventDefault(); guardarProyecto(); return; }
		if (ctrl && k === "o") { e.preventDefault(); abrirProyecto(); return; }
		if (ctrl && k === "n" && !e.shiftKey) { e.preventDefault(); nuevoMetodo(); return; }
		if (ctrl && e.shiftKey && k === "u") { e.preventDefault(); uml.tocarVista(); return; }
		if (ctrl && e.shiftKey && k === "d") { e.preventDefault(); tema.tocar(); return; }
		if (ctrl && e.shiftKey && k === "c") { e.preventDefault(); configuracion.tocarCasillas(); return; }
		if (enUml) { return; }
		if (k === "Tab" && ctrl) { e.preventDefault(); solapas.pasar(e.shiftKey ? -1 : 1); return; }
		if (ctrl && (k === "0" || k === "9" || k === "+" || k === "-" || k === "=")) {
			e.preventDefault();
			if (k === "0") { lupa.cien(); }
			else if (k === "9") { lupa.ajustar(); }
			else if (k === "-") { lupa.acercar(-0.1); }
			else { lupa.acercar(0.1); }
			return;
		}
		if (ctrl && k >= "1" && k <= "8") {
			e.preventDefault();
			solapas.ir(parseInt(k, 10) - 1);
		}
	}

	o.iniciar = function () {
		document.addEventListener("keydown", alApretar);
		var b = document.getElementById("nshHelpBtn");
		if (b) { b.addEventListener("click", ayuda); }
	};
	o.ayuda = ayuda;

	return o;
}());
