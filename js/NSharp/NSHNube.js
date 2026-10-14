var nube = (function () {
	var o = {};

	var RAPIDO = 1000;
	var SOLO = 4000;
	var CADA_EDITADO = 60000;
	var LATIDO = 60000;
	var VIGENCIA = 150000;
	var TANDA = 450;
	var COLORES = ["#e53935", "#8e24aa", "#3949ab", "#039be5", "#00897b", "#7cb342", "#f4511e", "#6d4c41", "#d81b60", "#5e35b1"];

	var presente = { e: null, firma: "", t: 0, sub: null };
	var gente = {};
	var firmaGente = "";
	var pedido = null;
	var llegados = {};
	var ultimoAviso = 0;

	function db() { return cuenta.base(); }

	function yo() { return cuenta.usuario(); }

	function ahora() { return firebase.firestore.FieldValue.serverTimestamp(); }

	function refProyecto(id) { return db().collection("proyectos").doc(id); }

	function esActiva(e) { return !!e && e === solapas.actual(); }

	function nuevoEstado(id, datos) {
		return {
			id: id,
			datos: datos || {},
			base: {},
			remoto: {},
			subs: [],
			reloj: null,
			subiendo: 0,
			error: null,
			atrasado: false
		};
	}

	function rolDe(e) {
		if (!e || !e.nube) { return null; }
		var x = e.nube.datos || {};
		var u = yo();
		var c = cuenta.correo();
		if (u && x.dueno === u.uid) { return "dueno"; }
		if (u && ((x.editores || []).indexOf(c) !== -1 || x.enlace === "editor")) { return "editor"; }
		if (u && ((x.lectores || []).indexOf(c) !== -1 || x.enlace === "lector" || x.enlace === "editor")) { return "lector"; }
		return null;
	}

	function puedeEditar(e) {
		var r = rolDe(e);
		return !!yo() && (r === "dueno" || r === "editor");
	}

	function textoP(x) {
		return JSON.stringify({ nombre: (x.nombre || "").trim() || SIN_NOMBRE, carpetas: x.carpetas || "[]" });
	}

	function textoMetodo(x) {
		return JSON.stringify({
			clase: x.clase || "",
			nombre: x.nombre || "",
			code: x.code || "",
			pos: typeof x.pos === "number" ? x.pos : 0,
			carpeta: x.carpeta || ""
		});
	}

	function textoUml(x) {
		return JSON.stringify({ k: x.k, n: typeof x.n === "number" ? x.n : 0, d: x.d || "null" });
	}

	function claveUml(prefijo, id) {
		return "u/" + prefijo + "-" + encodeURIComponent(String(id));
	}

	function fotoLocal(e) {
		var r = {};
		var activa = esActiva(e);
		if (activa && lienzo.actualDiagram) { lienzo.refresh(); }
		var mets = solapas.lista(e);
		var carpetas = activa ? clases.paraGuardar(mets) : e.carpetas;
		var mapa = carpetas && carpetas.map instanceof Array ? carpetas.map : [];
		mets.forEach(function (d, i) {
			if (!d.nube) { d.nube = util.nuevoId("m"); }
			r["m/" + d.nube] = textoMetodo({
				clase: d.theClass, nombre: d.name, code: d.code, pos: i, carpeta: mapa[i] || ""
			});
		});
		var folders = (carpetas && carpetas.folders instanceof Array) ? carpetas.folders.map(function (c) {
			return { id: c.id, name: c.name, parent: c.parent || null };
		}) : [];
		r.p = textoP({ nombre: e.proy.name, carpetas: JSON.stringify(folders) });
		var dib = activa ? uml.guardar() : e.dibujo;
		if (dib) {
			(dib.cosas || []).forEach(function (c, i) {
				r[claveUml("c", c.id)] = textoUml({ k: "c", n: i, d: JSON.stringify(c) });
			});
			(dib.lineas || []).forEach(function (l, i) {
				r[claveUml("l", l.id)] = textoUml({ k: "l", n: i, d: JSON.stringify(l) });
			});
			if (dib.mem && dib.mem.length) {
				r["u/mem"] = textoUml({ k: "m", n: 0, d: JSON.stringify(dib.mem) });
			}
		}
		return r;
	}

	function dibujoDesde(mapa) {
		var cosas = [], lineas = [], mem = [];
		Object.keys(mapa).forEach(function (k) {
			if (k.indexOf("u/") !== 0) { return; }
			var x = JSON.parse(mapa[k]);
			var d = JSON.parse(x.d);
			if (x.k === "c") { cosas.push({ n: x.n, d: d }); }
			else if (x.k === "l") { lineas.push({ n: x.n, d: d }); }
			else if (x.k === "m" && d instanceof Array) { mem = d; }
		});
		function ordenar(v) {
			return v.sort(function (a, b) { return a.n - b.n; }).map(function (x) { return x.d; });
		}
		if (!cosas.length && !lineas.length && !mem.length) { return null; }
		return { v: 1, cosas: ordenar(cosas), lineas: ordenar(lineas), mem: mem };
	}

	function cajaDe(html) {
		var c = document.createElement("div");
		c.innerHTML = html || "";
		return c;
	}

	function entradas(raiz) {
		var vistas = {};
		return Array.prototype.map.call(raiz.querySelectorAll(".input-for-statement"), function (i) {
			var u = i.closest("[data-b]");
			var id = (u && raiz.contains(u)) ? u.getAttribute("data-b") : "raiz";
			vistas[id] = (vistas[id] || 0) + 1;
			return { i: i, k: id + "#" + vistas[id] };
		});
	}

	function firma(caja) {
		var c = caja.cloneNode(true);
		Array.prototype.forEach.call(c.querySelectorAll(".input-for-statement"), function (i) {
			i.removeAttribute("value");
			i.removeAttribute("style");
		});
		return c.innerHTML;
	}

	function valores(caja) {
		var r = {};
		entradas(caja).forEach(function (x) { r[x.k] = x.i.getAttribute("value") || ""; });
		return r;
	}

	function diferencias(antes, despues) {
		var r = {};
		Object.keys(despues).forEach(function (k) { if (despues[k] !== antes[k]) { r[k] = despues[k]; } });
		return r;
	}

	function ponerValores(caja, cambios) {
		entradas(caja).forEach(function (x) {
			if (!(x.k in cambios)) { return; }
			x.i.setAttribute("value", cambios[x.k]);
			x.i.style.width = (cambios[x.k].length + 0.5) + "ch";
		});
	}

	function fusionarCodigo(cb, cm, cs) {
		if (cm === cb || cm === cs) { return cs; }
		if (cs === cb) { return cm; }
		var b = cajaDe(cb), m = cajaDe(cm), s = cajaDe(cs);
		var fb = firma(b);
		var vb = valores(b);
		if (firma(m) === fb) {
			ponerValores(s, diferencias(vb, valores(m)));
			return s.innerHTML;
		}
		if (firma(s) === fb) {
			ponerValores(m, diferencias(vb, valores(s)));
			return m.innerHTML;
		}
		return cm;
	}

	function fusionarTexto(b, m, s) {
		if (!b || !m || !s) { return m || s; }
		var xb = JSON.parse(b), xm = JSON.parse(m), xs = JSON.parse(s);
		var code = fusionarCodigo(xb.code, xm.code, xs.code);
		var caja = cajaDe(code);
		var cl = caja.querySelector(".class-name>.input-for-statement");
		var no = caja.querySelector(".method-name>.input-for-statement");
		return textoMetodo({
			clase: cl ? (cl.getAttribute("value") || "") : xm.clase,
			nombre: no ? (no.getAttribute("value") || "") : xm.nombre,
			code: code,
			pos: xm.pos !== xb.pos ? xm.pos : xs.pos,
			carpeta: xm.carpeta !== xb.carpeta ? xm.carpeta : xs.carpeta
		});
	}

	function aplicarEnVivo(d) {
		var c = lienzo.container;
		var a = document.activeElement;
		var enCampo = !!a && c.contains(a) && a.classList.contains("input-for-statement");
		var foco = enCampo ? entradas(c).filter(function (x) { return x.i === a; })[0].k : null;
		var desde = enCampo ? a.selectionStart : null;
		var hasta = enCampo ? a.selectionEnd : null;
		var nueva = cajaDe(d.code);
		if (firma(nueva) === firma(cajaDe(util.htmlLimpio(c)))) {
			var v = valores(nueva);
			entradas(c).forEach(function (x) {
				var val = v[x.k];
				if (x.i === a || val === undefined || x.i.value === val) { return; }
				x.i.value = val;
				x.i.setAttribute("value", val);
				medirCampo(x.i);
			});
			lienzo.refresh();
		} else {
			lienzo.setDiagram(d);
			var otra = foco ? entradas(c).filter(function (x) { return x.k === foco; })[0] : null;
			if (otra) {
				otra.i.focus();
				try { otra.i.setSelectionRange(desde, hasta); } catch (x) { }
			}
		}
		historial.reset(d);
	}

	function reconstruir(e, mapa, aplicadas) {
		var activa = esActiva(e);
		var mets = solapas.lista(e);
		var porNube = {};
		mets.forEach(function (d) { if (d.nube) { porNube[d.nube] = d; } });

		var filas = [];
		Object.keys(mapa).forEach(function (k) {
			if (k.indexOf("m/") !== 0) { return; }
			var x = JSON.parse(mapa[k]);
			var mid = k.slice(2);
			var d = porNube[mid];
			if (!d) {
				d = new Metodo(x.clase, x.nombre, x.code);
				d.nube = mid;
			} else if (aplicadas[k]) {
				d.setData(x.clase, x.nombre, x.code);
			}
			filas.push({ d: d, pos: x.pos, carpeta: x.carpeta || null, mid: mid });
		});
		filas.sort(function (a, b) { return (a.pos - b.pos) || (a.mid < b.mid ? -1 : 1); });
		var nuevos = filas.map(function (f) { return f.d; });

		mets.forEach(function (d) {
			if (nuevos.indexOf(d) !== -1) { return; }
			e.proy.deleteDiagram(d.id);
			if (activa) {
				clases.olvidar(d.id);
				historial.olvidar(d.id);
			}
		});
		nuevos.forEach(function (d) { if (mets.indexOf(d) === -1) { e.proy.addDiagram(d); } });
		e.proy.setDiagrams(nuevos);

		var p = mapa.p ? JSON.parse(mapa.p) : { nombre: SIN_NOMBRE, carpetas: "[]" };
		e.proy.name = p.nombre;
		var folders = JSON.parse(p.carpetas || "[]");
		var antes = activa ? clases.todas() : ((e.carpetas && e.carpetas.folders) || []);
		var cerradas = {};
		antes.forEach(function (c) { if (c.open === false) { cerradas[c.id] = true; } });
		var datos = folders.length ? {
			v: 1,
			folders: folders.map(function (c) {
				return { id: c.id, name: c.name, parent: c.parent || null, open: !cerradas[c.id] };
			}),
			map: filas.map(function (f) { return f.carpeta; })
		} : null;

		var tocaUml = Object.keys(aplicadas).some(function (k) { return k.indexOf("u/") === 0; });
		var dib = dibujoDesde(mapa);

		if (!activa) {
			e.carpetas = datos;
			e.dibujo = dib;
			if (e.metodo && nuevos.indexOf(e.metodo) === -1) { e.metodo = null; }
			solapas.pintar();
			return;
		}

		clases.desdeArchivo(datos, nuevos);
		if (tocaUml) { uml.recibir(dib); }
		var actual = lienzo.actualDiagram;
		if (actual && nuevos.indexOf(actual) === -1) { actual = null; lienzo.actualDiagram = null; }
		if (!actual && nuevos.length) {
			lienzo.setDiagram(nuevos[0]);
			historial.reset(nuevos[0]);
		} else if (!actual) {
			lienzo.setDiagram(null);
		} else if (aplicadas["m/" + actual.nube]) {
			aplicarEnVivo(actual);
		}
		arbol.activar(lienzo.actualDiagram);
		util.actualizarTitulo();
	}

	function ocupado(e, k) {
		if (!esActiva(e)) { return false; }
		if (k.indexOf("m/") === 0) {
			var d = lienzo.actualDiagram;
			return !!d && "m/" + d.nube === k && document.body.classList.contains("nsh-dragging");
		}
		return false;
	}

	function conciliar(e) {
		var n = e && e.nube;
		if (!n) { return; }
		var libre = !puedeEditar(e);
		var local = null;
		var aplicadas = {};
		var fusiones = {};
		var hay = false;
		n.atrasado = false;
		var claves = Object.keys(n.remoto).concat(Object.keys(n.base).filter(function (k) { return !(k in n.remoto); }));
		claves.forEach(function (k) {
			if (n.remoto[k] === n.base[k]) { return; }
			if (!local) { local = fotoLocal(e); }
			if (ocupado(e, k)) { n.atrasado = true; return; }
			if (!libre && local[k] !== n.base[k]) {
				if (k.indexOf("m/") !== 0 || !n.base[k] || local[k] === undefined || n.remoto[k] === undefined) { return; }
				fusiones[k] = fusionarTexto(n.base[k], local[k], n.remoto[k]);
			}
			aplicadas[k] = true;
			hay = true;
		});
		if (!hay) { return; }

		var mapa = {};
		Object.keys(local).forEach(function (k) { mapa[k] = local[k]; });
		Object.keys(aplicadas).forEach(function (k) {
			if (k in fusiones) {
				mapa[k] = fusiones[k];
				n.base[k] = n.remoto[k];
			} else if (n.remoto[k] === undefined) {
				delete mapa[k];
				delete n.base[k];
			} else {
				mapa[k] = n.remoto[k];
				n.base[k] = n.remoto[k];
			}
		});
		reconstruir(e, mapa, aplicadas);

		if (!libre) {
			var despues = fotoLocal(e);
			var corre = Object.keys(aplicadas).some(function (k) { return despues[k] !== n.base[k]; });
			if (corre) { programar(e); }
		}
	}

	function operacion(e, k, v) {
		var ref = refProyecto(e.nube.id);
		if (k === "p") {
			var p = JSON.parse(v);
			return { ref: ref, actualizar: true, datos: { nombre: p.nombre, carpetas: p.carpetas, editado: ahora(), por: cuenta.nombre() } };
		}
		var col = k.indexOf("m/") === 0 ? "metodos" : "uml";
		var doc = ref.collection(col).doc(k.slice(2));
		if (v === undefined) { return { ref: doc, borrar: true }; }
		var x = JSON.parse(v);
		if (col === "metodos") {
			x.editado = ahora();
			x.por = cuenta.nombre();
		}
		return { ref: doc, datos: x };
	}

	function escribir(e, ops) {
		var n = e.nube;
		var lotes = [];
		for (var i = 0; i < ops.length; i += TANDA) {
			var b = db().batch();
			ops.slice(i, i + TANDA).forEach(function (op) {
				if (op.borrar) { b.delete(op.ref); }
				else if (op.actualizar) { b.update(op.ref, op.datos); }
				else { b.set(op.ref, op.datos); }
			});
			lotes.push(b.commit());
		}
		n.subiendo++;
		n.error = null;
		estado();
		return Promise.all(lotes).then(function () {
			n.subiendo--;
			if (!n.subiendo && !n.reloj) { guardado(e); }
			estado();
		}).catch(function (err) {
			n.subiendo--;
			n.error = err;
			console.error(err);
			estado();
			if (err && err.code === "permission-denied") {
				util.aviso("No tenés permiso para editar este proyecto", 3200);
			}
		});
	}

	function transaccion(e, claves, local) {
		var n = e.nube;
		var ref = refProyecto(n.id);
		var enviados = {};
		var bases = {};
		claves.forEach(function (k) {
			enviados[k] = local[k];
			bases[k] = n.base[k];
		});
		n.transando = true;
		n.subiendo++;
		n.error = null;
		estado();
		db().runTransaction(function (tx) {
			var refs = claves.map(function (k) { return ref.collection("metodos").doc(k.slice(2)); });
			return Promise.all(refs.map(function (r) { return tx.get(r); })).then(function (snaps) {
				var finales = {};
				snaps.forEach(function (s, i) {
					var k = claves[i];
					var fin = enviados[k];
					if (s.exists) {
						var suyo = textoMetodo(s.data());
						if (suyo !== bases[k] && suyo !== fin) { fin = fusionarTexto(bases[k], fin, suyo); }
					}
					var x = JSON.parse(fin);
					x.editado = ahora();
					x.por = cuenta.nombre();
					tx.set(refs[i], x);
					finales[k] = fin;
				});
				if (tocaEditado(n)) { tx.update(ref, { editado: ahora(), por: cuenta.nombre() }); }
				return finales;
			});
		}).then(function (finales) {
			n.transando = false;
			n.subiendo--;
			Object.keys(finales).forEach(function (k) {
				n.base[k] = enviados[k];
				n.remoto[k] = finales[k];
			});
			conciliar(e);
			if (!n.subiendo && !n.reloj) { guardado(e); }
			estado();
		}).catch(function (err) {
			n.transando = false;
			n.subiendo--;
			var codigo = err && err.code ? err.code : "";
			if (codigo === "unavailable" || codigo === "failed-precondition" || codigo === "aborted") {
				escribir(e, claves.map(function (k) {
					n.base[k] = enviados[k];
					n.remoto[k] = enviados[k];
					return operacion(e, k, enviados[k]);
				}));
				return;
			}
			n.error = err;
			console.error(err);
			estado();
			if (codigo === "permission-denied") {
				util.aviso("No tenés permiso para editar este proyecto", 3200);
			}
		});
	}

	function guardado(e) {
		if (esActiva(e)) { util.marcarGuardado(); } else { e.sucio = false; }
		solapas.pintar();
	}

	function subir(e) {
		var n = e && e.nube;
		if (!n) { return; }
		if (n.reloj) {
			window.clearTimeout(n.reloj);
			n.reloj = null;
		}
		if (!puedeEditar(e)) { estado(); return; }
		if (e.creando) {
			programar(e);
			return;
		}
		var local = fotoLocal(e);
		var claves = Object.keys(local).filter(function (k) { return local[k] !== n.base[k]; })
			.concat(Object.keys(n.base).filter(function (k) { return !(k in local); }));
		if (!claves.length) {
			if (!n.subiendo) { guardado(e); }
			estado();
			return;
		}
		var juntas = !acompanado(e) ? [] : claves.filter(function (k) {
			return k.indexOf("m/") === 0 && local[k] !== undefined && n.base[k] !== undefined;
		});
		var resto = claves.filter(function (k) { return juntas.indexOf(k) === -1; });
		if (juntas.length && n.transando) {
			juntas = [];
			programar(e);
		}
		if (resto.length) {
			var ops = resto.map(function (k) {
				var v = local[k];
				if (v === undefined) {
					delete n.base[k];
					delete n.remoto[k];
				} else {
					n.base[k] = v;
					n.remoto[k] = v;
				}
				return operacion(e, k, v);
			});
			if (resto.indexOf("p") === -1 && tocaEditado(n)) {
				ops.push({ ref: refProyecto(n.id), actualizar: true, datos: { editado: ahora(), por: cuenta.nombre() } });
			}
			escribir(e, ops);
		}
		if (juntas.length) { transaccion(e, juntas, local); }
	}

	function acompanado(e) {
		return esActiva(e) && presente.e === e && vivos().length > 0;
	}

	function tocaEditado(n) {
		var t = Date.now();
		if (t - (n.editadoEn || 0) < CADA_EDITADO) { return false; }
		n.editadoEn = t;
		return true;
	}

	function programar(e) {
		var n = e && e.nube;
		if (!n || !puedeEditar(e) || n.reloj) { return; }
		n.reloj = window.setTimeout(function () {
			n.reloj = null;
			subir(e);
		}, acompanado(e) ? RAPIDO : SOLO);
		estado();
		solapas.pintar();
	}

	function subirNuevo(e) {
		if (!e || !yo() || !db()) { return Promise.resolve(null); }
		if (e.nube) { return Promise.resolve(e.nube.id); }
		if (e.creando) { return e.creando; }
		var u = yo();
		var id = db().collection("proyectos").doc().id;
		var local = fotoLocal(e);
		var p = JSON.parse(local.p);
		var datos = {
			nombre: p.nombre,
			carpetas: p.carpetas,
			dueno: u.uid,
			duenoNombre: cuenta.nombre(),
			duenoCorreo: cuenta.correo(),
			editores: [],
			lectores: [],
			enlace: "nadie",
			creado: ahora(),
			editado: ahora(),
			por: cuenta.nombre()
		};
		var n = nuevoEstado(id, datos);
		n.subiendo++;
		e.nube = n;
		n.base.p = local.p;
		n.remoto.p = local.p;
		estado();
		solapas.pintar();
		e.creando = refProyecto(id).set(datos).then(function () {
			e.creando = null;
			n.subiendo--;
			seguir(e);
			if (esActiva(e)) { alMostrar(e); }
			subir(e);
			util.aviso("Se guardó en tu cuenta. Desde ahora se guarda solo", 3200);
			return id;
		}).catch(function (err) {
			e.creando = null;
			e.nube = null;
			console.error(err);
			util.aviso("No se pudo guardar el proyecto en la cuenta", 3200);
			estado();
			solapas.pintar();
			return null;
		});
		return e.creando;
	}

	function soltarEscuchas(e) {
		var n = e && e.nube;
		if (!n) { return; }
		n.subs.forEach(function (fn) { try { fn(); } catch (x) { } });
		n.subs = [];
		if (n.reloj) {
			window.clearTimeout(n.reloj);
			n.reloj = null;
		}
	}

	function perdido(e, err) {
		var n = e && e.nube;
		if (!n || n.perdido) { return; }
		n.perdido = true;
		console.error(err);
		soltarEscuchas(e);
		if (presente.e === e) { salirPresencia(); }
		e.nube = null;
		if (esActiva(e)) { util.ponerCambios(true); } else { e.sucio = true; }
		util.aviso('Ya no tenés acceso a "' + solapas.nombre(e) + '". Queda abierto como copia local.', 4200);
		solapas.pintar();
		estado();
		ponerUrl(solapas.actual());
	}

	function alProyecto(e, s) {
		var n = e.nube;
		if (!n) { return; }
		if (!s.exists) {
			perdido(e, { code: "not-found" });
			return;
		}
		var antes = rolDe(e);
		n.datos = s.data();
		n.remoto.p = textoP(n.datos);
		conciliar(e);
		if (rolDe(e) !== antes) {
			solapas.pintar();
			estado();
		}
		if (typeof compartir !== "undefined") { compartir.alCambiar(e); }
	}

	function alColeccion(e, s, pre) {
		var n = e.nube;
		if (!n) { return; }
		s.docChanges().forEach(function (c) {
			var k = pre + c.doc.id;
			if (c.type === "removed") { delete n.remoto[k]; }
			else { n.remoto[k] = pre === "m/" ? textoMetodo(c.doc.data()) : textoUml(c.doc.data()); }
		});
		conciliar(e);
	}

	function seguir(e) {
		var n = e && e.nube;
		if (!n || n.subs.length) { return; }
		var ref = refProyecto(n.id);
		var mal = function (err) { perdido(e, err); };
		n.subs.push(ref.onSnapshot(function (s) { alProyecto(e, s); }, mal));
		n.subs.push(ref.collection("metodos").onSnapshot(function (s) { alColeccion(e, s, "m/"); }, mal));
		n.subs.push(ref.collection("uml").onSnapshot(function (s) { alColeccion(e, s, "u/"); }, mal));
	}

	function abrir(pid) {
		var ya = solapas.todas().filter(function (e) { return e.nube && e.nube.id === pid; })[0];
		if (ya) {
			solapas.irA(ya);
			return Promise.resolve(ya);
		}
		if (!db()) {
			util.aviso("El inicio de sesión todavía no está configurado", 3200);
			return Promise.resolve(null);
		}
		util.aviso("Abriendo el proyecto…");
		var ref = refProyecto(pid);
		return Promise.all([ref.get(), ref.collection("metodos").get(), ref.collection("uml").get()]).then(function (r) {
			if (!r[0].exists) { throw { code: "not-found" }; }
			var mapa = { p: textoP(r[0].data()) };
			r[1].forEach(function (d) { mapa["m/" + d.id] = textoMetodo(d.data()); });
			r[2].forEach(function (d) { mapa["u/" + d.id] = textoUml(d.data()); });
			var n = nuevoEstado(pid, r[0].data());
			var todas = {};
			Object.keys(mapa).forEach(function (k) {
				n.base[k] = mapa[k];
				n.remoto[k] = mapa[k];
				todas[k] = true;
			});
			var tmp = { proy: new Proyecto(par()), carpetas: null, dibujo: null, metodo: null };
			reconstruir(tmp, mapa, todas);
			var e = solapas.agregar(tmp.proy, { carpetas: tmp.carpetas, dibujo: tmp.dibujo, nube: n });
			util.marcarGuardado();
			seguir(e);
			return e;
		}).catch(function (err) {
			var codigo = err && err.code ? err.code : "";
			if (codigo === "permission-denied" || codigo === "not-found") {
				if (!yo()) {
					pedido = pid;
					util.aviso("Para abrir el proyecto iniciá sesión con tu cuenta de ORT (arriba a la derecha)", 5200);
				} else {
					alert("Ese proyecto no existe o no tenés permiso para verlo.\n" +
						"Pedile a quien lo compartió que te agregue con " + cuenta.correo() + ".");
				}
			} else {
				alert("No se pudo abrir el proyecto.\n\nDetalle: " + (err && err.message ? err.message : err));
			}
			return null;
		});
	}

	function borrar(pid) {
		var ref = refProyecto(pid);
		var abierta = solapas.todas().filter(function (e) { return e.nube && e.nube.id === pid; })[0];
		if (abierta) {
			soltarEscuchas(abierta);
			if (presente.e === abierta) { salirPresencia(); }
			abierta.nube = null;
			if (esActiva(abierta)) { util.ponerCambios(true); } else { abierta.sucio = true; }
			solapas.pintar();
			estado();
			ponerUrl(solapas.actual());
		}
		return Promise.all(["metodos", "uml", "gente"].map(function (c) { return ref.collection(c).get(); })).then(function (r) {
			var refs = [];
			r.forEach(function (s) { s.forEach(function (d) { refs.push(d.ref); }); });
			var lotes = [];
			for (var i = 0; i < refs.length; i += TANDA) {
				var b = db().batch();
				refs.slice(i, i + TANDA).forEach(function (x) { b.delete(x); });
				lotes.push(b.commit());
			}
			return Promise.all(lotes);
		}).then(function () { return ref.delete(); });
	}

	function cambiarAcceso(e, datos) {
		if (!e || !e.nube) { return Promise.reject(new Error("El proyecto no está en la cuenta")); }
		return refProyecto(e.nube.id).update(datos);
	}

	function link(e) {
		if (!e || !e.nube) { return ""; }
		var u = new URL(window.location.href);
		u.search = "";
		u.hash = "";
		u.searchParams.set("p", e.nube.id);
		return u.toString();
	}

	function ponerUrl(e) {
		try {
			var u = new URL(window.location.href);
			if (e && e.nube) { u.searchParams.set("p", e.nube.id); } else { u.searchParams.delete("p"); }
			window.history.replaceState(null, "", u.toString());
		} catch (x) { }
	}

	function colorDe(uid) {
		var h = 0;
		for (var i = 0; i < uid.length; i++) { h = (h * 31 + uid.charCodeAt(i)) >>> 0; }
		return COLORES[h % COLORES.length];
	}

	function vivos() {
		var t = Date.now();
		return Object.keys(gente).filter(function (uid) { return t - (gente[uid].t || 0) < VIGENCIA; });
	}

	function dondeEsta(x) {
		if (x.vista === "uml") { return "en el diagrama UML"; }
		var d = solapas.lista(solapas.actual()).filter(function (m) { return m.nube && m.nube === x.metodo; })[0];
		return d ? "en " + metodos.rotulo(d) : "en el proyecto";
	}

	function pintarGente() {
		var caja = document.getElementById("nshGente");
		if (!caja) { return; }
		var ids = vivos();
		var sello = ids.map(function (uid) {
			var x = gente[uid];
			return uid + x.metodo + x.vista + x.foto + (x.bloque || "") + (x.uml || "");
		}).join("|");
		if (sello === firmaGente) { return; }
		firmaGente = sello;
		caja.innerHTML = "";
		ids.slice(0, 5).forEach(function (uid) {
			var x = gente[uid];
			var s = document.createElement("span");
			s.className = "nsh-gente-cara";
			s.style.setProperty("--nsh-gente", colorDe(uid));
			s.title = (x.nombre || "Alguien") + " · " + dondeEsta(x);
			s.innerHTML = cuenta.avatar(x.foto, x.nombre, "nsh-avatar");
			caja.appendChild(s);
		});
		if (ids.length > 5) {
			var mas = document.createElement("span");
			mas.className = "nsh-gente-mas";
			mas.textContent = "+" + (ids.length - 5);
			caja.appendChild(mas);
		}
		marcarArbol();
	}

	function editando(uid) {
		var x = gente[uid];
		var d = lienzo.actualDiagram;
		return !!x && !!d && x.vista !== "uml" && !!x.bloque && x.metodo === d.nube;
	}

	function quienEdita(u) {
		if (!u || !esActiva(presente.e)) { return null; }
		var id = u.getAttribute("data-b");
		var uid = vivos().filter(function (x) { return editando(x) && gente[x].bloque === id; })[0];
		return uid ? gente[uid] : null;
	}

	function avisarBloqueo(x, que) {
		var t = Date.now();
		if (t - ultimoAviso < 1500) { return; }
		ultimoAviso = t;
		util.aviso((x.nombre || "Alguien") + " está editando " + (que || "este bloque"));
	}

	function editandoUml(uid) {
		var x = gente[uid];
		return !!x && x.vista === "uml" && !!x.uml && esActiva(presente.e);
	}

	function idsUml(x) {
		return String(x.uml || "").split(",").filter(Boolean);
	}

	function quienEditaUml(id) {
		var uid = vivos().filter(function (x) { return editandoUml(x) && idsUml(gente[x]).indexOf(id) !== -1; })[0];
		return uid ? gente[uid] : null;
	}

	function umlBloqueado(ids) {
		var x = null;
		if (ids === null) {
			var uid = vivos().filter(editandoUml)[0];
			if (uid) {
				avisarBloqueo(gente[uid], "el diagrama UML");
				return true;
			}
			return false;
		}
		ids.some(function (id) {
			x = quienEditaUml(id);
			return !!x;
		});
		if (x) { avisarBloqueo(x, "ese elemento"); }
		return !!x;
	}

	function etiqueta(sel, color, nombre) {
		return sel + "::after{content:" + nombre + ";position:absolute;top:-20px;right:-4px;padding:1px 7px;" +
			"border-radius:5px 5px 0 5px;background:" + color + ";color:#fff;font:600 11px/16px Verdana,sans-serif;" +
			"white-space:nowrap;pointer-events:none;z-index:6}";
	}

	function pintarBloqueos() {
		var st = document.getElementById("nshBloqueos");
		if (!st) {
			st = document.createElement("style");
			st.id = "nshBloqueos";
			document.head.appendChild(st);
		}
		var reglas = [];
		vivos().forEach(function (uid) {
			var x = gente[uid];
			var color = colorDe(uid);
			var nombre = JSON.stringify((x.nombre || "Alguien").split(" ")[0].replace(/[\u0000-\u001f]/g, ""));
			if (editando(uid)) {
				var sel = '#actualDiagram [data-b="' + String(x.bloque).replace(/["\\]/g, "") + '"]';
				reglas.push(sel + "{outline:3px solid " + color + ";outline-offset:2px;position:relative}");
				reglas.push(etiqueta(sel, color, nombre));
				reglas.push(sel + " .input-for-statement{cursor:not-allowed}");
				reglas.push(sel + " [data-b] .input-for-statement{cursor:auto}");
			}
			if (editandoUml(uid)) {
				idsUml(x).forEach(function (bruto) {
					var id = bruto.replace(/["\\]/g, "");
					var caja = '#umlCanvas .uml-caja[data-uml-id="' + id + '"]';
					reglas.push(caja + "{outline:3px solid " + color + ";outline-offset:3px;overflow:visible;cursor:not-allowed}");
					reglas.push(etiqueta(caja, color, nombre));
					reglas.push('#umlSvg .uml-golpe[data-uml-rel="' + id + '"]{stroke:' + color + ";stroke-opacity:.45;cursor:not-allowed}");
				});
			}
		});
		var txt = reglas.join("\n");
		if (st.textContent !== txt) { st.textContent = txt; }
	}

	function frenarUml(ev) {
		if (uml.uniendo()) { return; }
		var t = ev.target;
		var caja = t.closest ? t.closest(".uml-caja") : null;
		var id = caja ? caja.getAttribute("data-uml-id") : (t.getAttribute ? t.getAttribute("data-uml-rel") : null);
		var x = id ? quienEditaUml(id) : null;
		if (!x) { return; }
		ev.preventDefault();
		ev.stopPropagation();
		avisarBloqueo(x, "ese elemento");
	}

	function frenar(ev) {
		var x = quienEdita(util.unidadDe(ev.target));
		if (!x) { return; }
		ev.preventDefault();
		ev.stopPropagation();
		if (ev.type === "focusin" && ev.target.blur) { ev.target.blur(); }
		avisarBloqueo(x);
	}

	function hayBloqueados(nodos) {
		var x = null;
		(nodos || []).some(function (n) {
			var u = [n].concat(Array.prototype.slice.call(n.querySelectorAll ? n.querySelectorAll("[data-b]") : []));
			return u.some(function (b) {
				x = quienEdita(b);
				return !!x;
			});
		});
		if (x) { avisarBloqueo(x); }
		return !!x;
	}

	function revisarLlegadas(avisar) {
		var ahora = vivos();
		var nuevos = ahora.filter(function (uid) { return !llegados[uid]; });
		if (avisar) {
			nuevos.forEach(function (uid) {
				util.aviso((gente[uid].nombre || "Alguien") + " se unió al proyecto", 3200);
			});
		}
		if (avisar && nuevos.length) { window.setTimeout(function () { latir(true); }, 0); }
		llegados = {};
		ahora.forEach(function (uid) { llegados[uid] = true; });
	}

	function marcarArbol() {
		var e = solapas.actual();
		pintarBloqueos();
		util.qq(".nsh-row-gente").forEach(function (n) { n.remove(); });
		if (!e || !e.nube) { return; }
		var ids = vivos();
		if (!ids.length) { return; }
		solapas.lista(e).forEach(function (d) {
			var aca = ids.filter(function (uid) { return gente[uid].vista !== "uml" && gente[uid].metodo === d.nube; });
			if (!aca.length) { return; }
			var f = document.querySelector('.nsh-row[data-nsh-kind="diagram"][data-nsh-id="' + d.id + '"]');
			if (!f) { return; }
			var z = document.createElement("span");
			z.className = "nsh-row-gente";
			z.title = aca.map(function (uid) { return gente[uid].nombre || "Alguien"; }).join(", ");
			aca.slice(0, 3).forEach(function (uid) {
				var p = document.createElement("i");
				p.style.background = colorDe(uid);
				z.appendChild(p);
			});
			var r = f.querySelector(".nsh-row-label");
			if (r) { f.insertBefore(z, r.nextSibling); } else { f.appendChild(z); }
		});
	}

	function latir(forzar) {
		var e = presente.e;
		if (!e || !e.nube || !yo()) { return; }
		var d = lienzo.actualDiagram;
		var a = document.activeElement;
		var u = (a && lienzo.container.contains(a) && util.escribiendo(a)) ? util.unidadDe(a) : null;
		var x = {
			nombre: cuenta.nombre(),
			foto: yo().photoURL || "",
			metodo: d && d.nube ? d.nube : "",
			vista: uml.activo() ? "uml" : "ns",
			bloque: u && !uml.activo() ? u.getAttribute("data-b") : "",
			uml: uml.activo() ? uml.seleccion().join(",") : "",
			t: Date.now()
		};
		var sello = x.metodo + "|" + x.vista + "|" + x.bloque + "|" + x.uml;
		var vence = x.t - presente.t >= LATIDO;
		if (!forzar && !vence && (sello === presente.firma || !vivos().length)) { return; }
		presente.firma = sello;
		presente.t = x.t;
		refProyecto(e.nube.id).collection("gente").doc(yo().uid).set(x).catch(function () { });
	}

	function salirPresencia() {
		var e = presente.e;
		if (e && e.nube && yo()) {
			refProyecto(e.nube.id).collection("gente").doc(yo().uid).delete().catch(function () { });
		}
		if (presente.sub) {
			presente.sub();
			presente.sub = null;
		}
		presente.e = null;
		presente.firma = "";
		gente = {};
		llegados = {};
		pintarGente();
		pintarBloqueos();
	}

	function entrarPresencia(e) {
		if (presente.e === e) { return; }
		salirPresencia();
		if (!e || !e.nube || !yo()) { return; }
		presente.e = e;
		latir(true);
		var primera = true;
		presente.sub = refProyecto(e.nube.id).collection("gente").onSnapshot(function (s) {
			var u = yo();
			gente = {};
			s.forEach(function (doc) { if (!u || doc.id !== u.uid) { gente[doc.id] = doc.data(); } });
			revisarLlegadas(!primera);
			primera = false;
			pintarGente();
			pintarBloqueos();
		}, function () { });
	}

	function pendiente(e) {
		if (!e) { return false; }
		if (e.creando) { return true; }
		var n = e.nube;
		return !!n && (!!n.reloj || n.subiendo > 0 || !!n.error);
	}

	function estado() {
		var caja = document.getElementById("nshNubeEstado");
		if (!caja) { return; }
		var e = solapas.actual();
		var html = "";
		if (e && e.nube) {
			var n = e.nube;
			var btnCompartir = rolDe(e) === "dueno"
				? ' · <button type="button" data-nsh-compartir="1"><i class="fa fa-share-alt"></i> Compartir</button>'
				: "";
			if (!puedeEditar(e)) { html = '<i class="fa fa-eye"></i> Solo lectura'; }
			else if (n.error) { html = '<i class="fa fa-exclamation-triangle"></i> No se pudo guardar en la cuenta'; }
			else if (n.reloj || n.subiendo) {
				html = (navigator.onLine === false
					? '<i class="fa fa-wifi"></i> Sin conexión: se guarda al volver'
					: '<i class="fa fa-refresh fa-spin"></i> Guardando…') + btnCompartir;
			}
			else { html = '<i class="fa fa-cloud"></i> Guardado en la cuenta' + btnCompartir; }
		} else if (e) {
			html = '<i class="fa fa-laptop"></i> Proyecto local' + (cuenta.configurada()
				? ' · <button type="button" data-nsh-guardar="1"><i class="fa fa-cloud-upload"></i> Guardar en la cuenta</button>'
				: "");
		}
		if (caja.innerHTML !== html) { caja.innerHTML = html; }
	}

	function guardarEnCuenta() {
		var e = solapas.actual();
		if (!e) { return; }
		if (e.nube) {
			util.aviso("Este proyecto ya se guarda en tu cuenta");
			return;
		}
		if (!cuenta.configurada()) {
			util.aviso("El inicio de sesión todavía no está configurado", 3200);
			return;
		}
		cuenta.conSesion(function () {
			if (e !== solapas.actual() || e.nube) { return; }
			if (!tieneNombre() && !pedirNombre()) { return; }
			subirNuevo(e);
		});
	}

	function alCambio() {
		var e = solapas.actual();
		if (e && e.nube) { programar(e); }
	}

	function alMostrar(e) {
		ponerUrl(e);
		entrarPresencia(e);
		conciliar(e);
		estado();
	}

	function alDejar(e) {
		if (!e) { return; }
		if (e.nube && e.nube.reloj) { subir(e); }
		if (presente.e === e) { salirPresencia(); }
	}

	function soltar(e) {
		if (!e) { return; }
		if (presente.e === e) { salirPresencia(); }
		soltarEscuchas(e);
	}

	function alUsuario(u) {
		if (!u) {
			salirPresencia();
			solapas.todas().forEach(function (e) {
				if (!e.nube) { return; }
				soltarEscuchas(e);
				e.nube = null;
				solapas.cerrar(e, true);
			});
			solapas.pintar();
			estado();
			return;
		}
		var act = solapas.actual();
		if (act && act.nube) {
			presente.e = null;
			alMostrar(act);
		}
		if (pedido) {
			var pid = pedido;
			pedido = null;
			abrir(pid);
		}
		solapas.pintar();
		estado();
	}

	o.iniciar = function () {
		util.alCambiar = alCambio;
		cuenta.alCambiar(alUsuario);

		var c = lienzo.container;
		if (c) {
			c.addEventListener("input", alCambio);
			c.addEventListener("focusin", function () { window.setTimeout(latir, 0); });
			c.addEventListener("focusout", function () {
				window.setTimeout(function () {
					latir();
					conciliar(solapas.actual());
				}, 0);
			});
			["pointerdown", "mousedown", "dblclick", "focusin"].forEach(function (t) {
				c.addEventListener(t, frenar, true);
			});
		}
		var lu = document.getElementById("umlCanvas");
		if (lu) {
			["pointerdown", "dblclick"].forEach(function (t) { lu.addEventListener(t, frenarUml, true); });
			["pointerup", "keyup"].forEach(function (t) {
				document.addEventListener(t, function () { window.setTimeout(latir, 0); });
			});
		}
		var t = document.getElementById("umlText");
		if (t) {
			t.addEventListener("blur", function () {
				window.setTimeout(function () { conciliar(solapas.actual()); }, 0);
			});
		}
		window.addEventListener("pointerup", function () {
			window.setTimeout(function () {
				var e = solapas.actual();
				if (e && e.nube && e.nube.atrasado) { conciliar(e); }
			}, 50);
		});
		var pie = document.getElementById("nshNubeEstado");
		if (pie) {
			pie.addEventListener("click", function (ev) {
				if (ev.target.closest("[data-nsh-guardar]")) { guardarEnCuenta(); }
				if (ev.target.closest("[data-nsh-compartir]")) { compartir.abrir(); }
			});
		}
		var b = document.getElementById("nshGuardarCuentaBtn");
		if (b) { b.addEventListener("click", guardarEnCuenta); }
		window.addEventListener("online", estado);
		window.addEventListener("offline", estado);
		document.addEventListener("visibilitychange", function () {
			if (document.visibilityState === "visible") { latir(true); }
		});
		window.setInterval(function () {
			var e = solapas.actual();
			if (e && e.nube && e.nube.atrasado) { conciliar(e); }
			if (document.visibilityState === "visible") { latir(false); }
			revisarLlegadas(false);
			pintarGente();
			pintarBloqueos();
		}, 2000);

		var pid = new URLSearchParams(window.location.search).get("p");
		cuenta.cuando(function () {
			if (pid) { abrir(pid); }
		});
		estado();
	};

	o.rolDe = rolDe;
	o.puedeEditar = puedeEditar;
	o.soloLectura = function () {
		var e = solapas.actual();
		return !!(e && e.nube && !puedeEditar(e));
	};
	o.pendiente = pendiente;
	o.hayBloqueados = hayBloqueados;
	o.umlBloqueado = umlBloqueado;
	o.umlDeOtro = function (id) { return !!quienEditaUml(id); };
	o.hayPendientes = function () { return solapas.todas().some(pendiente); };
	o.subirNuevo = subirNuevo;
	o.guardarEnCuenta = guardarEnCuenta;
	o.abrir = abrir;
	o.borrar = borrar;
	o.cambiarAcceso = cambiarAcceso;
	o.link = link;
	o.alMostrar = alMostrar;
	o.alDejar = alDejar;
	o.soltar = soltar;
	o.marcarArbol = marcarArbol;
	o.alIrse = function () {
		var e = solapas.actual();
		if (e && e.nube && e.nube.reloj) { subir(e); }
		salirPresencia();
	};

	return o;
}());
