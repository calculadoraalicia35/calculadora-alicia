/*!
 * Calculadora Alicia — calculadoras matemáticas paso a paso
 * https://calculadoraaliciaai.es
 * Licencia GPL-2.0-or-later
 *
 * JavaScript sin dependencias. Dos widgets independientes:
 *   1. Operaciones combinadas (.aoc-root)
 *   2. Regla de tres (.art-root)
 * Cada uno se inicializa solo si su marcado existe en la página.
 */

/**
 * Calculadora Alicia AI – Operaciones Combinadas
 * Vanilla JS. No jQuery. Multi-instance safe.
 * Modes: calc | practica | reglas
 */
(function () {
	'use strict';

	/* ============================================================
	 * 1. RATIONAL NUMBER (exact fractions)
	 * ========================================================== */

	function gcdInt(a, b) {
		a = Math.abs(a); b = Math.abs(b);
		while (b) { var t = b; b = a % b; a = t; }
		return a;
	}

	/* value = { n: numerator, d: denominator, ap: isApproximate } */
	function V(n, d, ap) {
		d = (d === undefined) ? 1 : d;
		if (d === 0) { throw new CalcError('No se puede dividir entre cero.'); }
		if (d < 0) { n = -n; d = -d; }
		if (!ap) {
			var g = gcdInt(n, d) || 1;
			n = n / g; d = d / g;
		}
		return { n: n, d: d, ap: !!ap };
	}

	function fromDecimal(x, ap) {
		if (!isFinite(x)) { throw new CalcError('El resultado no es un número válido.'); }
		if (ap || Math.abs(x - Math.round(x)) > 1e-12) {
			/* try to keep it rational for short decimals */
			var s = String(x);
			var dot = s.indexOf('.');
			if (!ap && dot !== -1 && s.length - dot - 1 <= 9 && s.indexOf('e') === -1) {
				var dec = s.length - dot - 1;
				return V(Math.round(x * Math.pow(10, dec)), Math.pow(10, dec), false);
			}
			return { n: x, d: 1, ap: true };
		}
		return V(Math.round(x), 1, false);
	}

	function toFloat(v) { return v.n / v.d; }

	function vAdd(a, b) {
		if (a.ap || b.ap) { return fromDecimal(toFloat(a) + toFloat(b), true); }
		return V(a.n * b.d + b.n * a.d, a.d * b.d);
	}
	function vSub(a, b) {
		if (a.ap || b.ap) { return fromDecimal(toFloat(a) - toFloat(b), true); }
		return V(a.n * b.d - b.n * a.d, a.d * b.d);
	}
	function vMul(a, b) {
		if (a.ap || b.ap) { return fromDecimal(toFloat(a) * toFloat(b), true); }
		return V(a.n * b.n, a.d * b.d);
	}
	function vDiv(a, b) {
		if (b.n === 0) { throw new CalcError('No se puede dividir entre cero.'); }
		if (a.ap || b.ap) { return fromDecimal(toFloat(a) / toFloat(b), true); }
		return V(a.n * b.d, a.d * b.n);
	}
	function vNeg(a) { return a.ap ? { n: -a.n, d: 1, ap: true } : V(-a.n, a.d); }

	function vPow(a, b) {
		if (!a.ap && !b.ap && b.d === 1 && Math.abs(b.n) <= 40) {
			var e = b.n;
			if (e === 0) {
				if (a.n === 0) { throw new CalcError('La expresión 0 elevado a 0 no está definida.'); }
				return V(1, 1);
			}
			var base = e > 0 ? a : vDiv(V(1, 1), a);
			var k = Math.abs(e), res = V(1, 1);
			for (var i = 0; i < k; i++) { res = vMul(res, base); }
			if (Math.abs(res.n) > 1e15 || Math.abs(res.d) > 1e15) { return fromDecimal(Math.pow(toFloat(a), e), true); }
			return res;
		}
		var r = Math.pow(toFloat(a), toFloat(b));
		if (isNaN(r)) { throw new CalcError('No se puede calcular esa potencia.'); }
		return fromDecimal(r, true);
	}

	function vSqrt(a) {
		if (toFloat(a) < 0) { throw new CalcError('No existe la raíz cuadrada de un número negativo.'); }
		if (!a.ap) {
			var sn = Math.sqrt(a.n), sd = Math.sqrt(a.d);
			if (Number.isInteger(sn) && Number.isInteger(sd)) { return V(sn, sd); }
		}
		return fromDecimal(Math.sqrt(toFloat(a)), true);
	}

	function fmt(v) {
		if (v.ap) {
			var x = Math.round(v.n * 1e6) / 1e6;
			return String(x).replace('.', ',');
		}
		if (v.d === 1) { return String(v.n); }
		return v.n + '/' + v.d;
	}

	/* how a value looks inside an expression (negatives wrapped) */
	function fmtIn(v, needParen) {
		var s = fmt(v);
		if (needParen && (v.n < 0 || (!v.ap && v.d !== 1))) { return '(' + s + ')'; }
		return s;
	}

	function decimalOf(v) {
		if (v.ap || v.d === 1) { return null; }
		var x = v.n / v.d;
		var r = Math.round(x * 1e6) / 1e6;
		return String(r).replace('.', ',');
	}

	/* ============================================================
	 * 2. ERRORS
	 * ========================================================== */

	function CalcError(msg) { this.message = msg; this.isCalc = true; }
	CalcError.prototype.toString = function () { return this.message; };

	/* ============================================================
	 * 3. TOKENIZER
	 * ========================================================== */

	var OPEN = { '(': ')', '[': ']', '{': '}' };
	var CLOSE = { ')': '(', ']': '[', '}': '{' };

	function tokenize(src) {
		var s = String(src)
			.replace(/\s+/g, '')
			.replace(/[*·xX]/g, '×')
			.replace(/[\/:]/g, '÷')
			.replace(/[–—−]/g, '-')
			.replace(/\u00b2/g, '^2')
			.replace(/\u00b3/g, '^3')
			.replace(/sqrt/gi, '√')
			.replace(/raiz/gi, '√');

		if (!s) { throw new CalcError('Escribe una operación para resolver.'); }

		var toks = [], i = 0;
		while (i < s.length) {
			var c = s[i];
			if (/[0-9]/.test(c) || ((c === '.' || c === ',') && /[0-9]/.test(s[i + 1] || ''))) {
				var num = '', dots = 0;
				while (i < s.length && (/[0-9]/.test(s[i]) || s[i] === '.' || s[i] === ',')) {
					if (s[i] === '.' || s[i] === ',') { dots++; if (dots > 1) { throw new CalcError('Hay un número con dos comas decimales.'); } num += '.'; }
					else { num += s[i]; }
					i++;
				}
				toks.push({ t: 'num', v: fromDecimal(parseFloat(num), false) });
				continue;
			}
			if (c === '+' || c === '-' || c === '×' || c === '÷' || c === '^') {
				toks.push({ t: 'op', v: c }); i++; continue;
			}
			if (c === '√') { toks.push({ t: 'sqrt' }); i++; continue; }
			if (c === '%') { toks.push({ t: 'pct' }); i++; continue; }
			if (OPEN[c]) { toks.push({ t: 'open', v: c }); i++; continue; }
			if (CLOSE[c]) { toks.push({ t: 'close', v: c }); i++; continue; }
			throw new CalcError('El símbolo "' + c + '" no se puede usar aquí.');
		}
		return normalize(toks);
	}

	/* turn "-" into unary marker where needed, add implicit × , validate */
	function normalize(toks) {
		var out = [];
		for (var i = 0; i < toks.length; i++) {
			var tk = toks[i];
			var prev = out.length ? out[out.length - 1] : null;
			var prevIsValue = prev && (prev.t === 'num' || prev.t === 'close');

			if (tk.t === 'op' && (tk.v === '-' || tk.v === '+') && !prevIsValue) {
				if (tk.v === '-') { out.push({ t: 'u' }); }
				continue;
			}
			if ((tk.t === 'num' || tk.t === 'open' || tk.t === 'sqrt') && prevIsValue) {
				out.push({ t: 'op', v: '×' });
			}
			if (tk.t === 'pct') {
				if (!prevIsValue) { throw new CalcError('El símbolo % debe ir después de un número.'); }
				out.push({ t: 'op', v: '÷' });
				out.push({ t: 'num', v: V(100, 1) });
				continue;
			}
			out.push(tk);
		}
		validate(out);
		return out;
	}

	function validate(toks) {
		var stack = [];
		for (var i = 0; i < toks.length; i++) {
			var tk = toks[i], nx = toks[i + 1];
			if (tk.t === 'open') { stack.push(tk.v); }
			if (tk.t === 'close') {
				if (!stack.length) { throw new CalcError('Sobra un signo de cierre "' + tk.v + '".'); }
				var op = stack.pop();
				if (OPEN[op] !== tk.v) { throw new CalcError('Los signos de agrupación no coinciden: falta cerrar "' + op + '".'); }
			}
			if (tk.t === 'op' && (!nx || nx.t === 'op' || nx.t === 'close')) {
				throw new CalcError('Falta un número después del signo "' + tk.v + '".');
			}
			if (tk.t === 'open' && nx && nx.t === 'close') { throw new CalcError('Hay un paréntesis vacío.'); }
			if (tk.t === 'sqrt' && (!nx || (nx.t !== 'num' && nx.t !== 'open' && nx.t !== 'u' && nx.t !== 'sqrt'))) {
				throw new CalcError('Falta el número dentro de la raíz.');
			}
		}
		if (stack.length) { throw new CalcError('Falta cerrar el signo de agrupación "' + stack[stack.length - 1] + '".'); }
		var hasNum = toks.some(function (t) { return t.t === 'num'; });
		if (!hasNum) { throw new CalcError('Escribe al menos un número.'); }
	}

	/* ============================================================
	 * 4. RENDERING TOKENS BACK TO TEXT
	 * ========================================================== */

	function tokStr(tk) {
		if (tk.t === 'num') { return fmt(tk.v); }
		if (tk.t === 'op') { return tk.v; }
		if (tk.t === 'u') { return '-'; }
		if (tk.t === 'sqrt') { return '√'; }
		return tk.v;
	}

	function render(toks, hiFrom, hiTo) {
		var out = '';
		for (var i = 0; i < toks.length; i++) {
			var tk = toks[i], prev = toks[i - 1];
			var sp = '';
			if (i > 0) {
				var binary = (tk.t === 'op' && tk.v !== '^');
				var afterBinary = (prev.t === 'op' && prev.v !== '^');
				if (binary || afterBinary) { sp = ' '; }
			}
			var piece = tokStr(tk);
			if (tk.t === 'num' && tk.v.n < 0) {
				var needs = prev && (prev.t === 'op' || prev.t === 'u' || prev.t === 'sqrt');
				if (needs) { piece = '(' + piece + ')'; }
			}
			var open = (hiFrom !== undefined && i === hiFrom) ? '<mark>' : '';
			var close = (hiTo !== undefined && i === hiTo) ? '</mark>' : '';
			out += sp + open + piece + close;
		}
		return out;
	}

	/* ============================================================
	 * 5. STEP-BY-STEP SOLVER
	 * ========================================================== */

	var RULE = {
		group: 'Signos de agrupación',
		power: 'Potencias y raíces',
		sign: 'Signo negativo',
		muldiv: 'Multiplicación y división (de izquierda a derecha)',
		addsub: 'Suma y resta (de izquierda a derecha)'
	};

	function opName(op) {
		return { '+': 'Sumamos', '-': 'Restamos', '×': 'Multiplicamos', '÷': 'Dividimos', '^': 'Elevamos' }[op] || 'Calculamos';
	}

	function solve(src) {
		var toks = tokenize(src);
		var steps = [];
		var guard = 0;

		while (toks.length > 1) {
			if (++guard > 400) { throw new CalcError('La operación es demasiado larga para resolverla paso a paso.'); }

			/* 5.1 innermost group first */
			var ci = -1;
			for (var i = 0; i < toks.length; i++) { if (toks[i].t === 'close') { ci = i; break; } }

			if (ci !== -1) {
				var oi = ci - 1;
				while (oi >= 0 && toks[oi].t !== 'open') { oi--; }
				var inner = toks.slice(oi + 1, ci);

				if (inner.length === 1 && inner[0].t === 'num') {
					toks = toks.slice(0, oi).concat(inner, toks.slice(ci + 1));
					continue;
				}
				var r = reduceOnce(inner, toks, oi + 1, RULE.group);
				if (r) {
					steps.push(r.step);
					toks = toks.slice(0, oi + 1).concat(r.tokens, toks.slice(ci));
					continue;
				}
				toks = toks.slice(0, oi).concat(inner, toks.slice(ci + 1));
				continue;
			}

			/* 5.2 flat expression */
			var r2 = reduceOnce(toks, toks, 0, null);
			if (!r2) { break; }
			steps.push(r2.step);
			toks = r2.tokens;
		}

		if (toks.length !== 1 || toks[0].t !== 'num') { throw new CalcError('No se pudo resolver la expresión. Revisa que esté bien escrita.'); }

		return { steps: steps, result: toks[0].v };
	}

	/**
	 * Applies ONE operation inside `seg` following the order of operations.
	 * `full`/`offset` are used only to show the whole expression in the step.
	 */
	function reduceOnce(seg, full, offset, forcedRule) {
		var i;

		/* a) sqrt applied to a single number (innermost = rightmost √) */
		for (i = seg.length - 1; i >= 0; i--) {
			if (seg[i].t === 'sqrt' && seg[i + 1] && seg[i + 1].t === 'num') {
				var vr = vSqrt(seg[i + 1].v);
				return mk(seg, full, offset, i, i + 1, vr,
					'Calculamos la raíz cuadrada de ' + fmt(seg[i + 1].v) + '.',
					forcedRule || RULE.power);
			}
		}

		/* b) powers, right to left */
		for (i = seg.length - 1; i >= 0; i--) {
			if (seg[i].t === 'op' && seg[i].v === '^' && seg[i - 1] && seg[i - 1].t === 'num' && seg[i + 1] && seg[i + 1].t === 'num') {
				var vp = vPow(seg[i - 1].v, seg[i + 1].v);
				return mk(seg, full, offset, i - 1, i + 1, vp,
					'Elevamos ' + fmt(seg[i - 1].v) + ' a la ' + fmt(seg[i + 1].v) + '.',
					forcedRule || RULE.power);
			}
		}

		/* c) unary minus, right to left (after powers: -3² = -9) */
		for (i = seg.length - 1; i >= 0; i--) {
			if (seg[i].t === 'u' && seg[i + 1] && seg[i + 1].t === 'num') {
				var vn = vNeg(seg[i + 1].v);
				return mk(seg, full, offset, i, i + 1, vn,
					'Aplicamos el signo negativo a ' + fmt(seg[i + 1].v) + '.',
					forcedRule || RULE.sign);
			}
		}

		/* d) × and ÷, left to right */
		for (i = 0; i < seg.length; i++) {
			if (seg[i].t === 'op' && (seg[i].v === '×' || seg[i].v === '÷') && seg[i - 1] && seg[i - 1].t === 'num' && seg[i + 1] && seg[i + 1].t === 'num') {
				var a = seg[i - 1].v, b = seg[i + 1].v;
				var vm = seg[i].v === '×' ? vMul(a, b) : vDiv(a, b);
				return mk(seg, full, offset, i - 1, i + 1, vm,
					opName(seg[i].v) + ' ' + fmt(a) + ' ' + seg[i].v + ' ' + fmt(b) + '.',
					forcedRule || RULE.muldiv);
			}
		}

		/* e) + and −, left to right */
		for (i = 0; i < seg.length; i++) {
			if (seg[i].t === 'op' && (seg[i].v === '+' || seg[i].v === '-') && seg[i - 1] && seg[i - 1].t === 'num' && seg[i + 1] && seg[i + 1].t === 'num') {
				var a2 = seg[i - 1].v, b2 = seg[i + 1].v;
				var vs = seg[i].v === '+' ? vAdd(a2, b2) : vSub(a2, b2);
				return mk(seg, full, offset, i - 1, i + 1, vs,
					opName(seg[i].v) + ' ' + fmt(a2) + ' ' + seg[i].v + ' ' + fmt(b2) + '.',
					forcedRule || RULE.addsub);
			}
		}

		return null;
	}

	function mk(seg, full, offset, from, to, value, text, rule) {
		var before = render(full, offset + from, offset + to);
		var newSeg = seg.slice(0, from).concat([{ t: 'num', v: value }], seg.slice(to + 1));
		var newFull = full.slice(0, offset).concat(newSeg, full.slice(offset + seg.length));
		return {
			tokens: newSeg,
			step: {
				rule: rule,
				text: text,
				before: before,
				after: render(newFull, offset + from, offset + from),
				value: fmt(value)
			}
		};
	}

	/* ============================================================
	 * 6. PRACTICE GENERATOR
	 * ========================================================== */

	function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

	function makeExercise(level) {
		var e;
		if (level === 'primaria') {
			var t = ri(1, 3);
			if (t === 1) { e = ri(2, 12) + ' + ' + ri(2, 9) + ' × ' + ri(2, 9); }
			else if (t === 2) { e = '(' + ri(4, 15) + ' + ' + ri(2, 9) + ') × ' + ri(2, 6); }
			else { e = ri(20, 60) + ' - ' + ri(2, 9) + ' × ' + ri(2, 8) + ' + ' + ri(2, 12); }
		} else {
			var t2 = ri(1, 4);
			if (t2 === 1) { e = ri(10, 30) + ' - [' + ri(2, 6) + ' × (' + ri(6, 12) + ' - ' + ri(2, 5) + ') + ' + ri(2, 9) + ']'; }
			else if (t2 === 2) { e = ri(2, 4) + '² + √' + [4, 9, 16, 25, 36, 49, 64, 81][ri(0, 7)] + ' × ' + ri(2, 5) + ' - ' + ri(2, 9); }
			else if (t2 === 3) { e = '-' + ri(2, 9) + ' + ' + ri(2, 6) + ' × (-' + ri(2, 6) + ') - (-' + ri(2, 10) + ')'; }
			else { e = ri(2, 3) + ' × {' + ri(12, 20) + ' - [' + ri(2, 6) + ' + (' + ri(5, 9) + ' - ' + ri(1, 4) + ') × ' + ri(2, 3) + ']}'; }
		}
		try { solve(e); } catch (err) { return makeExercise(level); }
		return e;
	}

	/* ============================================================
	 * 7. UI
	 * ========================================================== */

	var ICONS = {
		calc: '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="12" y1="16" x2="12" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
		practice: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
		rules: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
		bolt: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
		eraser: '<svg viewBox="0 0 24 24"><path d="M20 20H8.5L3 14.5a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l6.7 6.7a2 2 0 0 1 0 2.8L14 19"/><path d="M9 13l5 5"/></svg>',
		steps: '<svg viewBox="0 0 24 24"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>',
		alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
		check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>',
		dice: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>'
	};

	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	function markSafe(s) { return esc(s).replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>'); }

	var KEYS = [
		['C', 'del', '(', ')'],
		['7', '8', '9', '÷'],
		['4', '5', '6', '×'],
		['1', '2', '3', '-'],
		['0', ',', '±', '+'],
		['[', ']', '{', '}'],
		['^', '√', '%', '=']
	];

	function buildCalc(root) {
		var shell = root.querySelector('[data-role="body"]');
		var keys = '';
		KEYS.forEach(function (row) {
			row.forEach(function (k) {
				var cls = 'aoc-key';
				if (k === '=') { cls += ' eq'; }
				else if (k === 'C') { cls += ' clr'; }
				else if ('+-×÷^√%'.indexOf(k) !== -1) { cls += ' op'; }
				else if ('()[]{}'.indexOf(k) !== -1) { cls += ' grp'; }
				var label = k === 'del' ? '⌫' : k;
				keys += '<button type="button" class="' + cls + '" data-key="' + esc(k) + '">' + esc(label) + '</button>';
			});
		});

		shell.innerHTML =
			'<div class="aoc-sec">Escribe tu operación combinada</div>' +
			'<div class="aoc-screen">' +
				'<input type="text" class="aoc-display" data-role="display" inputmode="text" spellcheck="false" autocomplete="off" placeholder="20 - [3 × (8 - 5) + 2]" aria-label="Operación combinada">' +
				'<div class="aoc-preview" data-role="preview">El resultado aparecerá aquí</div>' +
			'</div>' +
			'<div class="aoc-keys">' + keys + '</div>' +
			'<div class="aoc-quick">' +
				'<span>Ejemplos:</span>' +
				'<button type="button" data-ex="5 + 4 × 3 - 6 ÷ 2">5 + 4 × 3 - 6 ÷ 2</button>' +
				'<button type="button" data-ex="20 - [3 × (8 - 5) + 2]">20 - [3 × (8 - 5) + 2]</button>' +
				'<button type="button" data-ex="2 × {15 - [4 + (6 - 3) × 2]}">2 × {15 - [4 + (6 - 3) × 2]}</button>' +
				'<button type="button" data-ex="3^2 + √49 × 2 - 4">3² + √49 × 2 - 4</button>' +
			'</div>' +
			'<div data-role="out"></div>';

		var display = shell.querySelector('[data-role="display"]');
		var preview = shell.querySelector('[data-role="preview"]');
		var out = shell.querySelector('[data-role="out"]');

		function quietResult() {
			var raw = display.value.trim();
			if (!raw) { preview.textContent = 'El resultado aparecerá aquí'; preview.className = 'aoc-preview'; return; }
			try {
				var r = solve(raw);
				preview.textContent = '= ' + fmt(r.result);
				preview.className = 'aoc-preview ok';
			} catch (e) {
				preview.textContent = e && e.isCalc ? e.message : 'Revisa la expresión';
				preview.className = 'aoc-preview warn';
			}
		}

		function run() {
			var raw = display.value.trim();
			out.innerHTML = '';
			if (!raw) {
				out.innerHTML = errorBox('Escribe una operación combinada para resolverla.');
				return;
			}
			try {
				var r = solve(raw);
				out.innerHTML = renderSolution(raw, r);
			} catch (e) {
				out.innerHTML = errorBox(e && e.isCalc ? e.message : 'No se pudo resolver la expresión.');
			}
			quietResult();
		}

		shell.addEventListener('click', function (ev) {
			var keyBtn = ev.target.closest('[data-key]');
			if (keyBtn) {
				press(keyBtn.getAttribute('data-key'));
				return;
			}
			var exBtn = ev.target.closest('[data-ex]');
			if (exBtn) {
				display.value = exBtn.getAttribute('data-ex');
				run();
			}
		});

		function press(k) {
			if (k === 'C') { display.value = ''; out.innerHTML = ''; quietResult(); display.focus(); return; }
			if (k === 'del') { display.value = display.value.slice(0, -1); quietResult(); display.focus(); return; }
			if (k === '=') { run(); return; }
			if (k === '±') {
				var v = display.value;
				display.value = /(^|[-+×÷^([{ ])$/.test(v) ? v + '-' : v + ' × (-1)';
				quietResult(); display.focus(); return;
			}
			var glue = ('+-×÷^'.indexOf(k) !== -1) ? ' ' + k + ' ' : k;
			display.value += glue;
			quietResult();
			display.focus();
		}

		display.addEventListener('input', quietResult);
		display.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter') { ev.preventDefault(); run(); }
		});
	}

	function errorBox(msg) {
		return '<div class="aoc-err"><span class="aoc-ico">' + ICONS.alert + '</span>' + esc(msg) + '</div>';
	}

	function renderSolution(raw, r) {
		var html = '<div class="aoc-result">' +
			'<div class="aoc-result-lab">Resultado</div>' +
			'<div class="aoc-result-val">' + esc(fmt(r.result)) + '</div>';
		var dec = decimalOf(r.result);
		if (dec) { html += '<div class="aoc-result-dec">≈ ' + esc(dec) + ' en decimal</div>'; }
		if (r.result.ap) { html += '<div class="aoc-result-dec">Valor aproximado</div>'; }
		html += '</div>';

		if (!r.steps.length) {
			return html + '<div class="aoc-note">Esta expresión ya estaba resuelta: no hay operaciones que aplicar.</div>';
		}

		html += '<div class="aoc-sec">Procedimiento paso a paso</div><ol class="aoc-steps">';
		r.steps.forEach(function (s, idx) {
			html += '<li class="aoc-step">' +
				'<div class="aoc-step-head"><span class="aoc-step-n">' + (idx + 1) + '</span>' +
				'<span class="aoc-step-rule">' + esc(s.rule) + '</span></div>' +
				'<div class="aoc-step-txt">' + esc(s.text) + '</div>' +
				'<div class="aoc-step-line"><span class="aoc-lab">Antes</span><code>' + markSafe(s.before) + '</code></div>' +
				'<div class="aoc-step-line"><span class="aoc-lab">Queda</span><code>' + markSafe(s.after) + '</code></div>' +
				'</li>';
		});
		html += '</ol>';
		return html;
	}

	/* ---------- practice ---------- */

	function buildPractice(root) {
		var shell = root.querySelector('[data-role="body"]');
		shell.innerHTML =
			'<div class="aoc-sec">Practica con ejercicios</div>' +
			'<div class="aoc-levels">' +
				'<button type="button" class="aoc-lvl active" data-lvl="primaria">Primaria</button>' +
				'<button type="button" class="aoc-lvl" data-lvl="secundaria">Secundaria</button>' +
			'</div>' +
			'<div class="aoc-exercise" data-role="ex">—</div>' +
			'<div class="aoc-answer-row">' +
				'<input type="text" class="aoc-answer" data-role="ans" inputmode="text" placeholder="Tu respuesta" aria-label="Tu respuesta">' +
				'<button type="button" class="aoc-run" data-role="checkbtn"><span class="aoc-ico">' + ICONS.check + '</span>Comprobar</button>' +
			'</div>' +
			'<div class="aoc-actions">' +
				'<button type="button" class="aoc-clearbtn" data-role="newbtn"><span class="aoc-ico">' + ICONS.dice + '</span>Otro ejercicio</button>' +
				'<button type="button" class="aoc-clearbtn" data-role="solvebtn"><span class="aoc-ico">' + ICONS.steps + '</span>Ver solución</button>' +
			'</div>' +
			'<div data-role="pout"></div>';

		var exEl = shell.querySelector('[data-role="ex"]');
		var ansEl = shell.querySelector('[data-role="ans"]');
		var pout = shell.querySelector('[data-role="pout"]');
		var level = 'primaria';
		var current = '';

		function nuevo() {
			current = makeExercise(level);
			exEl.textContent = current;
			ansEl.value = '';
			pout.innerHTML = '';
		}

		function comprobar() {
			var val = ansEl.value.trim();
			if (!val) { pout.innerHTML = errorBox('Escribe tu respuesta antes de comprobar.'); return; }
			var correct = solve(current).result;
			var mine;
			try { mine = solve(val).result; }
			catch (e) { pout.innerHTML = errorBox('No se entiende esa respuesta. Escribe solo un número.'); return; }
			var same = Math.abs(toFloat(mine) - toFloat(correct)) < 1e-9;
			pout.innerHTML = same
				? '<div class="aoc-ok"><span class="aoc-ico">' + ICONS.check + '</span>¡Correcto! El resultado es ' + esc(fmt(correct)) + '.</div>'
				: '<div class="aoc-err"><span class="aoc-ico">' + ICONS.alert + '</span>Todavía no. Revisa el orden de las operaciones e inténtalo otra vez.</div>';
		}

		shell.addEventListener('click', function (ev) {
			var lvl = ev.target.closest('[data-lvl]');
			if (lvl) {
				level = lvl.getAttribute('data-lvl');
				shell.querySelectorAll('.aoc-lvl').forEach(function (b) { b.classList.toggle('active', b === lvl); });
				nuevo();
				return;
			}
			if (ev.target.closest('[data-role="newbtn"]')) { nuevo(); return; }
			if (ev.target.closest('[data-role="checkbtn"]')) { comprobar(); return; }
			if (ev.target.closest('[data-role="solvebtn"]')) {
				pout.innerHTML = renderSolution(current, solve(current));
			}
		});
		ansEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); comprobar(); } });

		nuevo();
	}

	/* ---------- rules ---------- */

	function buildRules(root) {
		var shell = root.querySelector('[data-role="body"]');
		shell.innerHTML =
			'<div class="aoc-sec">Jerarquía de operaciones</div>' +
			'<table class="aoc-table"><thead><tr><th>Orden</th><th>Operación</th><th>Regla</th></tr></thead><tbody>' +
			'<tr><td>1.ª</td><td>Paréntesis ( ), corchetes [ ] y llaves { }</td><td>Primero el más interno</td></tr>' +
			'<tr><td>2.ª</td><td>Potencias y raíces</td><td>Antes de multiplicar o dividir</td></tr>' +
			'<tr><td>3.ª</td><td>Multiplicación y división</td><td>Misma prioridad, de izquierda a derecha</td></tr>' +
			'<tr><td>4.ª</td><td>Suma y resta</td><td>Misma prioridad, de izquierda a derecha</td></tr>' +
			'</tbody></table>' +
			'<div class="aoc-sec">Ley de signos</div>' +
			'<table class="aoc-table"><thead><tr><th>Operación</th><th>Resultado</th><th>Ejemplo</th></tr></thead><tbody>' +
			'<tr><td>+ × +</td><td>+</td><td>3 × 4 = 12</td></tr>' +
			'<tr><td>− × −</td><td>+</td><td>(-3) × (-4) = 12</td></tr>' +
			'<tr><td>+ × −</td><td>−</td><td>3 × (-4) = -12</td></tr>' +
			'<tr><td>− × +</td><td>−</td><td>(-3) × 4 = -12</td></tr>' +
			'</tbody></table>' +
			'<div class="aoc-note">Restar un número negativo es lo mismo que sumar: 5 − (−2) = 5 + 2 = 7. ' +
			'Las mismas reglas de signos se aplican a la división.</div>' +
			'<div class="aoc-sec">Errores más comunes</div>' +
			'<ul class="aoc-list">' +
			'<li><strong>Creer que siempre se multiplica antes de dividir.</strong> 12 ÷ 3 × 2 = 8, no 2.</li>' +
			'<li><strong>Olvidar el orden de izquierda a derecha.</strong> 10 − 4 + 2 = 8, no 4.</li>' +
			'<li><strong>Aplicar un exponente sin paréntesis.</strong> −3² = −9, pero (−3)² = 9.</li>' +
			'<li><strong>No empezar por el signo de agrupación más interno.</strong> Primero ( ), luego [ ], luego { }.</li>' +
			'</ul>';
	}

	/* ---------- boot ---------- */

	function boot(root) {
		if (root.getAttribute('data-ready')) { return; }
		root.setAttribute('data-ready', '1');

		root.querySelectorAll('.aoc-ico[data-i]').forEach(function (el) {
			var k = el.getAttribute('data-i');
			if (ICONS[k]) { el.innerHTML = ICONS[k]; }
		});

		var builders = { calc: buildCalc, practica: buildPractice, reglas: buildRules };

		function show(mode) {
			root.querySelectorAll('.aoc-tab').forEach(function (t) {
				var on = t.getAttribute('data-mode') === mode;
				t.classList.toggle('active', on);
				t.setAttribute('aria-selected', on ? 'true' : 'false');
			});
			(builders[mode] || buildCalc)(root);
		}

		root.querySelectorAll('.aoc-tab').forEach(function (tab) {
			tab.addEventListener('click', function () { show(tab.getAttribute('data-mode')); });
		});

		show('calc');
	}

	function init() {
		document.querySelectorAll('.aoc-root').forEach(boot);
	}

	if (typeof document !== 'undefined') {
		if (!window.__aliciaOCLoaded) {
			window.__aliciaOCLoaded = true;
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', init);
			} else {
				init();
			}
		}
	}

	/* exported for tests */
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = { solve: solve, fmt: fmt, tokenize: tokenize, makeExercise: makeExercise };
	}
})();
/**
 * Calculadora Alicia AI – Regla de Tres
 * Modes: simple | compuesta | porcentajes
 * Vanilla JS. No jQuery. Multi-instance safe.
 */
(function () {
	'use strict';

	/* ============================================================
	 * HELPERS
	 * ========================================================== */

	function parseNum(raw) {
		if (raw === null || raw === undefined) { return NaN; }
		var s = String(raw).trim().replace(/\s/g, '');
		if (!s) { return NaN; }
		/* Spanish input: 1.234,56 or 1234,56 or 1234.56 */
		if (s.indexOf(',') !== -1) {
			s = s.replace(/\./g, '').replace(',', '.');
		}
		var n = parseFloat(s);
		return isFinite(n) ? n : NaN;
	}

	function fmt(n) {
		if (!isFinite(n)) { return '—'; }
		var r = Math.round(n * 1e6) / 1e6;
		var s = String(r);
		var parts = s.split('.');
		var int = parts[0];
		var neg = int[0] === '-';
		if (neg) { int = int.slice(1); }
		int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
		var out = (neg ? '-' : '') + int;
		if (parts[1]) { out += ',' + parts[1]; }
		return out;
	}

	function esc(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	/* ============================================================
	 * ENGINES
	 * ========================================================== */

	function solveSimple(a, b, c, type) {
		if (!isFinite(a) || !isFinite(b) || !isFinite(c)) {
			throw new Error('Completa los tres valores conocidos con números.');
		}
		if (type === 'directa' && a === 0) { throw new Error('El valor A no puede ser cero en una proporción directa.'); }
		if (type === 'inversa' && c === 0) { throw new Error('El valor C no puede ser cero en una proporción inversa.'); }

		var x, steps = [], check;

		if (type === 'directa') {
			x = (c * b) / a;
			steps = [
				{ r: 'Identifica el tipo', t: 'La relación es directa: si una cantidad aumenta, la otra también aumenta.' },
				{ r: 'Plantea la proporción', t: fmt(a) + ' → ' + fmt(b) + '  y  ' + fmt(c) + ' → X' },
				{ r: 'Aplica la fórmula', t: 'X = (C × B) ÷ A = (' + fmt(c) + ' × ' + fmt(b) + ') ÷ ' + fmt(a) },
				{ r: 'Multiplica', t: fmt(c) + ' × ' + fmt(b) + ' = ' + fmt(c * b) },
				{ r: 'Divide', t: fmt(c * b) + ' ÷ ' + fmt(a) + ' = ' + fmt(x) }
			];
			check = 'A ÷ B debe ser igual a C ÷ X:  ' + fmt(a) + ' ÷ ' + fmt(b) + ' = ' + fmt(a / b) +
				'  y  ' + fmt(c) + ' ÷ ' + fmt(x) + ' = ' + fmt(c / x);
		} else {
			x = (a * b) / c;
			steps = [
				{ r: 'Identifica el tipo', t: 'La relación es inversa: si una cantidad aumenta, la otra disminuye.' },
				{ r: 'Plantea la proporción', t: fmt(a) + ' → ' + fmt(b) + '  y  ' + fmt(c) + ' → X' },
				{ r: 'Aplica la fórmula', t: 'X = (A × B) ÷ C = (' + fmt(a) + ' × ' + fmt(b) + ') ÷ ' + fmt(c) },
				{ r: 'Multiplica', t: fmt(a) + ' × ' + fmt(b) + ' = ' + fmt(a * b) },
				{ r: 'Divide', t: fmt(a * b) + ' ÷ ' + fmt(c) + ' = ' + fmt(x) }
			];
			check = 'A × B debe ser igual a C × X:  ' + fmt(a * b) + ' = ' + fmt(c * x);
		}
		return { x: x, steps: steps, check: check };
	}

	function solveCompuesta(base, rows) {
		if (!isFinite(base)) { throw new Error('Escribe el valor conocido de la magnitud que buscas.'); }
		var used = rows.filter(function (r) { return isFinite(r.from) && isFinite(r.to); });
		if (!used.length) { throw new Error('Completa al menos una magnitud con sus dos valores.'); }

		var x = base, steps = [], factors = [];
		steps.push({ r: 'Punto de partida', t: 'El valor conocido de la magnitud buscada es ' + fmt(base) + '.' });

		used.forEach(function (r, i) {
			var num, den, why;
			if (r.rel === 'directa') {
				if (r.from === 0) { throw new Error('El primer valor de la magnitud ' + (i + 1) + ' no puede ser cero.'); }
				num = r.to; den = r.from;
				why = 'es directa, así que la razón se escribe ' + fmt(r.to) + ' ÷ ' + fmt(r.from) + '.';
			} else {
				if (r.to === 0) { throw new Error('El segundo valor de la magnitud ' + (i + 1) + ' no puede ser cero.'); }
				num = r.from; den = r.to;
				why = 'es inversa, así que la razón se invierte: ' + fmt(r.from) + ' ÷ ' + fmt(r.to) + '.';
			}
			var f = num / den;
			factors.push(fmt(num) + ' ÷ ' + fmt(den));
			x = x * f;
			steps.push({
				r: 'Magnitud ' + (i + 1) + (r.name ? ' · ' + r.name : ''),
				t: 'Pasa de ' + fmt(r.from) + ' a ' + fmt(r.to) + '. La relación ' + why +
					' Resultado parcial: ' + fmt(x) + '.'
			});
		});

		steps.push({
			r: 'Operación completa',
			t: 'X = ' + fmt(base) + ' × (' + factors.join(') × (') + ') = ' + fmt(x)
		});
		return { x: x, steps: steps, check: null };
	}

	function solvePorcentaje(mode, p, n) {
		var x, steps, check = null;
		if (mode === 'deN') {
			if (!isFinite(p) || !isFinite(n)) { throw new Error('Completa el porcentaje y el total.'); }
			x = (p * n) / 100;
			steps = [
				{ r: 'Plantea la regla de tres', t: '100 → ' + fmt(n) + '  y  ' + fmt(p) + ' → X' },
				{ r: 'Aplica la fórmula', t: 'X = (' + fmt(p) + ' × ' + fmt(n) + ') ÷ 100' },
				{ r: 'Multiplica', t: fmt(p) + ' × ' + fmt(n) + ' = ' + fmt(p * n) },
				{ r: 'Divide', t: fmt(p * n) + ' ÷ 100 = ' + fmt(x) }
			];
		} else if (mode === 'queP') {
			if (!isFinite(p) || !isFinite(n)) { throw new Error('Completa los dos valores.'); }
			if (n === 0) { throw new Error('El total no puede ser cero.'); }
			x = (p * 100) / n;
			steps = [
				{ r: 'Plantea la regla de tres', t: fmt(n) + ' → 100  y  ' + fmt(p) + ' → X' },
				{ r: 'Aplica la fórmula', t: 'X = (' + fmt(p) + ' × 100) ÷ ' + fmt(n) },
				{ r: 'Multiplica', t: fmt(p) + ' × 100 = ' + fmt(p * 100) },
				{ r: 'Divide', t: fmt(p * 100) + ' ÷ ' + fmt(n) + ' = ' + fmt(x) + ' %' }
			];
		} else {
			if (!isFinite(p) || !isFinite(n)) { throw new Error('Completa el porcentaje y la parte conocida.'); }
			if (p === 0) { throw new Error('El porcentaje no puede ser cero.'); }
			x = (n * 100) / p;
			steps = [
				{ r: 'Plantea la regla de tres', t: fmt(p) + ' → ' + fmt(n) + '  y  100 → X' },
				{ r: 'Aplica la fórmula', t: 'X = (100 × ' + fmt(n) + ') ÷ ' + fmt(p) },
				{ r: 'Multiplica', t: '100 × ' + fmt(n) + ' = ' + fmt(n * 100) },
				{ r: 'Divide', t: fmt(n * 100) + ' ÷ ' + fmt(p) + ' = ' + fmt(x) }
			];
		}
		return { x: x, steps: steps, check: check };
	}

	/* ============================================================
	 * ICONS
	 * ========================================================== */

	var ICONS = {
		simple: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
		compuesta: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="13" y1="4" x2="13" y2="20"/></svg>',
		pct: '<svg viewBox="0 0 24 24"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
		run: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
		check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>',
		alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
		plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
		eraser: '<svg viewBox="0 0 24 24"><path d="M20 20H8.5L3 14.5a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l6.7 6.7a2 2 0 0 1 0 2.8L14 19"/></svg>'
	};

	/* ============================================================
	 * OUTPUT RENDERING
	 * ========================================================== */

	function errorBox(msg) {
		return '<div class="art-err"><span class="art-ico">' + ICONS.alert + '</span>' + esc(msg) + '</div>';
	}

	function renderResult(r, unit) {
		var html = '<div class="art-result">' +
			'<div class="art-result-lab">Resultado</div>' +
			'<div class="art-result-val">X = ' + esc(fmt(r.x)) + (unit ? ' <span>' + esc(unit) + '</span>' : '') + '</div>' +
			'</div>';

		html += '<div class="art-sec">Procedimiento paso a paso</div><ol class="art-steps">';
		r.steps.forEach(function (s, i) {
			html += '<li class="art-step">' +
				'<div class="art-step-head"><span class="art-step-n">' + (i + 1) + '</span>' +
				'<span class="art-step-rule">' + esc(s.r) + '</span></div>' +
				'<div class="art-step-txt">' + esc(s.t) + '</div></li>';
		});
		html += '</ol>';

		if (r.check) {
			html += '<div class="art-ok"><span class="art-ico">' + ICONS.check + '</span>' +
				'<span><strong>Verificación: </strong>' + esc(r.check) + '</span></div>';
		}
		return html;
	}

	/* ============================================================
	 * MODE: SIMPLE
	 * ========================================================== */

	function buildSimple(root) {
		var shell = root.querySelector('[data-role="body"]');
		shell.innerHTML =
			'<div class="art-sec">Tipo de proporción</div>' +
			'<div class="art-types">' +
				'<button type="button" class="art-type active" data-type="directa">' +
					'<strong>Directa</strong><span>Más de una, más de la otra</span></button>' +
				'<button type="button" class="art-type" data-type="inversa">' +
					'<strong>Inversa</strong><span>Más de una, menos de la otra</span></button>' +
			'</div>' +
			'<div class="art-sec">Valores conocidos</div>' +
			'<div class="art-grid">' +
				'<label class="art-field"><span>Si A</span><input type="text" data-k="a" inputmode="decimal" placeholder="5"></label>' +
				'<label class="art-field"><span>equivale a B</span><input type="text" data-k="b" inputmode="decimal" placeholder="8"></label>' +
				'<label class="art-field"><span>entonces C</span><input type="text" data-k="c" inputmode="decimal" placeholder="12"></label>' +
				'<label class="art-field x"><span>equivale a X</span><div class="art-xbox" data-role="xbox">?</div></label>' +
			'</div>' +
			'<label class="art-field wide"><span>Unidad del resultado (opcional)</span>' +
				'<input type="text" data-k="unit" placeholder="euros, días, km..."></label>' +
			'<div class="art-actions">' +
				'<button type="button" class="art-run" data-role="run"><span class="art-ico">' + ICONS.run + '</span>Calcular</button>' +
				'<button type="button" class="art-clear" data-role="clear"><span class="art-ico">' + ICONS.eraser + '</span>Limpiar</button>' +
			'</div>' +
			'<div class="art-quick"><span>Ejemplos:</span>' +
				'<button type="button" data-ex="5|8|12|directa|euros">5 kg cuestan 8 € → 12 kg</button>' +
				'<button type="button" data-ex="6|30|10|inversa|días">6 obreros, 30 días → 10 obreros</button>' +
				'<button type="button" data-ex="60|4|80|inversa|horas">60 km/h, 4 h → 80 km/h</button>' +
			'</div>' +
			'<div data-role="out"></div>';

		var out = shell.querySelector('[data-role="out"]');
		var xbox = shell.querySelector('[data-role="xbox"]');
		var type = 'directa';
		function val(k) { return shell.querySelector('[data-k="' + k + '"]').value; }
		function setVal(k, v) { shell.querySelector('[data-k="' + k + '"]').value = v; }

		function run() {
			out.innerHTML = '';
			try {
				var r = solveSimple(parseNum(val('a')), parseNum(val('b')), parseNum(val('c')), type);
				xbox.textContent = fmt(r.x);
				xbox.classList.add('filled');
				out.innerHTML = renderResult(r, val('unit').trim());
			} catch (e) {
				xbox.textContent = '?';
				xbox.classList.remove('filled');
				out.innerHTML = errorBox(e.message);
			}
		}

		shell.addEventListener('click', function (ev) {
			var t = ev.target.closest('[data-type]');
			if (t) {
				type = t.getAttribute('data-type');
				shell.querySelectorAll('.art-type').forEach(function (b) { b.classList.toggle('active', b === t); });
				if (val('a') && val('b') && val('c')) { run(); }
				return;
			}
			if (ev.target.closest('[data-role="run"]')) { run(); return; }
			if (ev.target.closest('[data-role="clear"]')) {
				['a', 'b', 'c', 'unit'].forEach(function (k) { setVal(k, ''); });
				xbox.textContent = '?'; xbox.classList.remove('filled');
				out.innerHTML = '';
				return;
			}
			var ex = ev.target.closest('[data-ex]');
			if (ex) {
				var p = ex.getAttribute('data-ex').split('|');
				setVal('a', p[0]); setVal('b', p[1]); setVal('c', p[2]); setVal('unit', p[4] || '');
				type = p[3];
				shell.querySelectorAll('.art-type').forEach(function (b) {
					b.classList.toggle('active', b.getAttribute('data-type') === type);
				});
				run();
			}
		});
		shell.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); run(); }
		});
	}

	/* ============================================================
	 * MODE: COMPUESTA
	 * ========================================================== */

	function magRow(i) {
		return '<div class="art-mag" data-row="' + i + '">' +
			'<input type="text" class="art-mag-name" data-m="name" placeholder="Magnitud ' + (i + 1) + ' (obreros, horas...)">' +
			'<div class="art-mag-vals">' +
				'<input type="text" data-m="from" inputmode="decimal" placeholder="De">' +
				'<span class="art-arrow">→</span>' +
				'<input type="text" data-m="to" inputmode="decimal" placeholder="A">' +
				'<select data-m="rel"><option value="inversa">Inversa</option><option value="directa">Directa</option></select>' +
			'</div></div>';
	}

	function buildCompuesta(root) {
		var shell = root.querySelector('[data-role="body"]');
		shell.innerHTML =
			'<div class="art-note">Usa este modo cuando intervienen tres o más magnitudes. Indica el valor conocido de lo que quieres calcular y, para cada magnitud, cómo cambia y si su relación es directa o inversa.</div>' +
			'<div class="art-sec">Valor conocido de la magnitud buscada</div>' +
			'<div class="art-grid two">' +
				'<label class="art-field"><span>Valor conocido</span><input type="text" data-k="base" inputmode="decimal" placeholder="10"></label>' +
				'<label class="art-field"><span>Unidad (opcional)</span><input type="text" data-k="unit" placeholder="días"></label>' +
			'</div>' +
			'<div class="art-sec">Magnitudes que cambian</div>' +
			'<div data-role="mags">' + magRow(0) + magRow(1) + '</div>' +
			'<button type="button" class="art-clear add" data-role="add"><span class="art-ico">' + ICONS.plus + '</span>Añadir magnitud</button>' +
			'<div class="art-actions">' +
				'<button type="button" class="art-run" data-role="run"><span class="art-ico">' + ICONS.run + '</span>Calcular</button>' +
				'<button type="button" class="art-clear" data-role="clear"><span class="art-ico">' + ICONS.eraser + '</span>Limpiar</button>' +
			'</div>' +
			'<div class="art-quick"><span>Ejemplo:</span>' +
				'<button type="button" data-exc="1">4 obreros, 6 h/día, 10 días → 5 obreros, 8 h/día</button>' +
			'</div>' +
			'<div data-role="out"></div>';

		var mags = shell.querySelector('[data-role="mags"]');
		var out = shell.querySelector('[data-role="out"]');

		function readRows() {
			return Array.prototype.map.call(mags.querySelectorAll('.art-mag'), function (row) {
				return {
					name: row.querySelector('[data-m="name"]').value.trim(),
					from: parseNum(row.querySelector('[data-m="from"]').value),
					to: parseNum(row.querySelector('[data-m="to"]').value),
					rel: row.querySelector('[data-m="rel"]').value
				};
			});
		}

		function run() {
			out.innerHTML = '';
			try {
				var r = solveCompuesta(parseNum(shell.querySelector('[data-k="base"]').value), readRows());
				out.innerHTML = renderResult(r, shell.querySelector('[data-k="unit"]').value.trim());
			} catch (e) {
				out.innerHTML = errorBox(e.message);
			}
		}

		shell.addEventListener('click', function (ev) {
			if (ev.target.closest('[data-role="add"]')) {
				var n = mags.querySelectorAll('.art-mag').length;
				if (n >= 4) { return; }
				mags.insertAdjacentHTML('beforeend', magRow(n));
				return;
			}
			if (ev.target.closest('[data-role="run"]')) { run(); return; }
			if (ev.target.closest('[data-role="clear"]')) {
				shell.querySelectorAll('input').forEach(function (i) { i.value = ''; });
				out.innerHTML = '';
				return;
			}
			if (ev.target.closest('[data-exc]')) {
				shell.querySelector('[data-k="base"]').value = '10';
				shell.querySelector('[data-k="unit"]').value = 'días';
				var rows = mags.querySelectorAll('.art-mag');
				var data = [['obreros', '4', '5', 'inversa'], ['horas al día', '6', '8', 'inversa']];
				data.forEach(function (d, i) {
					if (!rows[i]) { return; }
					rows[i].querySelector('[data-m="name"]').value = d[0];
					rows[i].querySelector('[data-m="from"]').value = d[1];
					rows[i].querySelector('[data-m="to"]').value = d[2];
					rows[i].querySelector('[data-m="rel"]').value = d[3];
				});
				run();
			}
		});
		shell.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); run(); }
		});
	}

	/* ============================================================
	 * MODE: PORCENTAJES
	 * ========================================================== */

	var PCT = {
		deN: { l1: 'Porcentaje (%)', l2: 'Total', q: '¿Cuánto es el X % de un número?' },
		queP: { l1: 'Parte', l2: 'Total', q: '¿Qué porcentaje representa una parte del total?' },
		total: { l1: 'Porcentaje (%)', l2: 'Parte conocida', q: 'Si el X % es una cantidad, ¿cuál es el total?' }
	};

	function buildPorcentajes(root) {
		var shell = root.querySelector('[data-role="body"]');
		shell.innerHTML =
			'<div class="art-note">Todo cálculo de porcentaje es una regla de tres directa en la que el total equivale al 100 %.</div>' +
			'<div class="art-sec">¿Qué quieres calcular?</div>' +
			'<div class="art-types three">' +
				'<button type="button" class="art-type active" data-p="deN"><strong>% de un número</strong><span>15 % de 3.500</span></button>' +
				'<button type="button" class="art-type" data-p="queP"><strong>Qué % representa</strong><span>84 de 700</span></button>' +
				'<button type="button" class="art-type" data-p="total"><strong>Hallar el total</strong><span>12 % es 84</span></button>' +
			'</div>' +
			'<div class="art-grid two">' +
				'<label class="art-field"><span data-role="l1">Porcentaje (%)</span><input type="text" data-k="p" inputmode="decimal" placeholder="15"></label>' +
				'<label class="art-field"><span data-role="l2">Total</span><input type="text" data-k="n" inputmode="decimal" placeholder="3500"></label>' +
			'</div>' +
			'<div class="art-actions">' +
				'<button type="button" class="art-run" data-role="run"><span class="art-ico">' + ICONS.run + '</span>Calcular</button>' +
				'<button type="button" class="art-clear" data-role="clear"><span class="art-ico">' + ICONS.eraser + '</span>Limpiar</button>' +
			'</div>' +
			'<div data-role="out"></div>';

		var out = shell.querySelector('[data-role="out"]');
		var mode = 'deN';

		function run() {
			out.innerHTML = '';
			try {
				var r = solvePorcentaje(mode, parseNum(shell.querySelector('[data-k="p"]').value), parseNum(shell.querySelector('[data-k="n"]').value));
				out.innerHTML = renderResult(r, mode === 'queP' ? '%' : '');
			} catch (e) {
				out.innerHTML = errorBox(e.message);
			}
		}

		shell.addEventListener('click', function (ev) {
			var t = ev.target.closest('[data-p]');
			if (t) {
				mode = t.getAttribute('data-p');
				shell.querySelectorAll('.art-type').forEach(function (b) { b.classList.toggle('active', b === t); });
				shell.querySelector('[data-role="l1"]').textContent = PCT[mode].l1;
				shell.querySelector('[data-role="l2"]').textContent = PCT[mode].l2;
				out.innerHTML = '';
				return;
			}
			if (ev.target.closest('[data-role="run"]')) { run(); return; }
			if (ev.target.closest('[data-role="clear"]')) {
				shell.querySelectorAll('input').forEach(function (i) { i.value = ''; });
				out.innerHTML = '';
			}
		});
		shell.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); run(); }
		});
	}

	/* ============================================================
	 * BOOT
	 * ========================================================== */

	function boot(root) {
		if (root.getAttribute('data-ready')) { return; }
		root.setAttribute('data-ready', '1');

		root.querySelectorAll('.art-ico[data-i]').forEach(function (el) {
			var k = el.getAttribute('data-i');
			if (ICONS[k]) { el.innerHTML = ICONS[k]; }
		});

		var builders = { simple: buildSimple, compuesta: buildCompuesta, porcentajes: buildPorcentajes };

		function show(mode) {
			root.querySelectorAll('.art-tab').forEach(function (t) {
				var on = t.getAttribute('data-mode') === mode;
				t.classList.toggle('active', on);
				t.setAttribute('aria-selected', on ? 'true' : 'false');
			});
			(builders[mode] || buildSimple)(root);
		}

		root.querySelectorAll('.art-tab').forEach(function (tab) {
			tab.addEventListener('click', function () { show(tab.getAttribute('data-mode')); });
		});

		show('simple');
	}

	function init() { document.querySelectorAll('.art-root').forEach(boot); }

	if (typeof document !== 'undefined') {
		if (!window.__aliciaRTLoaded) {
			window.__aliciaRTLoaded = true;
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', init);
			} else { init(); }
		}
	}

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = { solveSimple: solveSimple, solveCompuesta: solveCompuesta, solvePorcentaje: solvePorcentaje, fmt: fmt, parseNum: parseNum };
	}
})();
