(() => {
	var globalMargin = 40;
	var pricingData = [];
	var todasCategorias = [];
	var debounceTimers = {};
	var custoFixoConfig = { mensal: 0, faturamentoMedioHistorico: 0, mesesConsiderados: 0, percentual: 0 };

	// DOM
	var globalMarginInput = document.getElementById("globalMargin");
	var btnSaveGlobal = document.getElementById("btnSaveGlobal");
	var custoFixoMensalInput = document.getElementById("custoFixoMensal");
	var btnSaveCustoFixo = document.getElementById("btnSaveCustoFixo");
	var custoFixoResultado = document.getElementById("custoFixoResultado");
	var massBar = document.getElementById("massBar");
	var massCount = document.getElementById("massCount");
	var massMargin = document.getElementById("massMargin");
	var btnMassApply = document.getElementById("btnMassApply");
	var selectAll = document.getElementById("selectAll");
	var tbody = document.getElementById("corpoPrecificacao");
	var aviso = document.getElementById("avisoPrecificacao");
	var mensagem = document.getElementById("mensagem");
	var searchInput = document.getElementById("searchInput");
	var filterCategoria = document.getElementById("filterCategoria");

	function esc(t) {
		return String(t == null ? "" : t)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function fmtCodigo(id) {
		return "#" + String(id).padStart(4, "0");
	}

	function fmtMoeda(v) {
		return Number(v || 0).toLocaleString("pt-BR", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	}

	function fmtPct(v) {
		return Number(v || 0).toFixed(1);
	}

	/* ==================== Cálculos ====================
	   Custo fixo é diluído como % do faturamento (não R$ fixo por unidade) —
	   ratear em R$ fixo penalizava desproporcionalmente produtos baratos.
	   A % vem do histórico real de vendas (custoFixoConfig.percentual). */

	function calcPrecoVenda(custo, impostos, margem, custoFixoPct) {
		var base = Number(custo || 0) + Number(impostos || 0);
		if (base <= 0) return 0;
		return base * (1 + Number(margem || 0) / 100) * (1 + Number(custoFixoPct || 0) / 100);
	}

	function calcMargem(custo, impostos, precoVenda, custoFixoPct) {
		var base = Number(custo || 0) + Number(impostos || 0);
		if (base <= 0) return 0;
		var baseComCustoFixo = base * (1 + Number(custoFixoPct || 0) / 100);
		if (baseComCustoFixo <= 0) return 0;
		return (Number(precoVenda || 0) / baseComCustoFixo - 1) * 100;
	}

	function calcLucro(custo, impostos, precoVenda, custoFixoPct) {
		var base = Number(custo || 0) + Number(impostos || 0);
		var baseComCustoFixo = base * (1 + Number(custoFixoPct || 0) / 100);
		return Number(precoVenda || 0) - baseComCustoFixo;
	}

	function margemEfetiva(p) {
		if (p.margem_percentual !== null && p.margem_percentual !== undefined) {
			return Number(p.margem_percentual);
		}
		return globalMargin;
	}

	function custoFixoDe(p) {
		return p.aplicar_custo_fixo ? custoFixoConfig.percentual : 0;
	}

	/* ==================== Filtros ==================== */

	function preencherFiltroCategoria() {
		var catsUnicas = [];
		var visto = {};
		todasCategorias.forEach((c) => {
			var nome = c.nome;
			if (!visto[nome]) {
				visto[nome] = true;
				catsUnicas.push({ id: c.id, nome: nome });
			}
		});
		filterCategoria.innerHTML = '<option value="">Todas as categorias</option>';
		catsUnicas.forEach((c) => {
			var opt = document.createElement("option");
			opt.value = c.nome;
			opt.textContent = c.nome;
			filterCategoria.appendChild(opt);
		});
	}

	function dadosFiltrados() {
		var q = (searchInput.value || "").trim().toLowerCase();
		var catFiltro = filterCategoria.value;
		return pricingData.filter((p) => {
			if (catFiltro) {
				var cats = (p.categorias || "").toLowerCase();
				if (cats.indexOf(catFiltro.toLowerCase()) === -1) return false;
			}
			if (!q) return true;
			return (
				((p.sku_primeiro || "") + " " + p.produto_nome)
					.toLowerCase()
					.indexOf(q) !== -1
			);
		});
	}

	/* ==================== Carregar dados ==================== */

	function carregar() {
		if (aviso) aviso.style.display = "block";
		aviso.innerHTML = "Carregando...";

		var promises = [
			window.api && window.erpBanco.precificacao.margemGlobal
				? window.erpBanco.precificacao.margemGlobal()
				: Promise.resolve(40),
			window.api && window.erpBanco.precificacao.dados
				? window.erpBanco.precificacao.dados()
				: Promise.resolve([]),
			erpCategoryStore.getCategoriasFlux(),
			window.api && window.erpBanco.precificacao.custoFixoConfig
				? window.erpBanco.precificacao.custoFixoConfig()
				: Promise.resolve({ mensal: 0, faturamentoMedioHistorico: 0, mesesConsiderados: 0, percentual: 0 }),
		];

		Promise.all(promises)
			.then((results) => {
				globalMargin = Number(results[0]) || 40;
				globalMarginInput.value = globalMargin;
				pricingData = Array.isArray(results[1]) ? results[1] : [];
				todasCategorias = Array.isArray(results[2]) ? results[2] : [];
				custoFixoConfig = results[3] || { mensal: 0, faturamentoMedioHistorico: 0, mesesConsiderados: 0, percentual: 0 };
				custoFixoMensalInput.value = custoFixoConfig.mensal || "";
				atualizarCustoFixoResultado();
				preencherFiltroCategoria();
				renderizar();
				aviso.style.display = "none";
			})
			.catch((err) => {
				aviso.innerHTML = "Erro ao carregar: " + esc(err);
			});
	}

	// Reage a mudanças de categorias vindas de outras telas
	erpCategoryStore.onChange((lista) => {
		todasCategorias = lista;
		preencherFiltroCategoria();
		renderizar();
	});

	/* ==================== Renderizar ==================== */

	function renderizar() {
		tbody.innerHTML = "";
		var filtrados = dadosFiltrados();
		if (filtrados.length === 0) {
			var msg =
				pricingData.length === 0
					? "Nenhum produto cadastrado ainda. Cadastre produtos e eles aparecerão aqui automaticamente."
					: "Nenhum produto encontrado para os filtros aplicados.";
			tbody.innerHTML =
				'<tr><td colspan="11"><div class="empty-state">' +
				msg +
				"</div></td></tr>";
			atualizarMassBar();
			return;
		}

		filtrados.forEach((p) => {
			var margemReal = margemEfetiva(p);
			var custoFixoAplicado = custoFixoDe(p);
			var precoCalculado =
				Number(p.preco_venda || 0) > 0
					? Number(p.preco_venda)
					: calcPrecoVenda(p.preco_custo, p.impostos_extras, margemReal, custoFixoAplicado);
			var lucro = calcLucro(p.preco_custo, p.impostos_extras, precoCalculado, custoFixoAplicado);

			var tr = document.createElement("tr");

			// 0: Checkbox
			var tdChk = document.createElement("td");
			var chk = document.createElement("input");
			chk.type = "checkbox";
			chk.className = "row-check";
			chk.value = p.produto_id;
			chk.addEventListener("change", atualizarMassBar);
			tdChk.appendChild(chk);
			tr.appendChild(tdChk);

			// 1: Código
			var tdCod = document.createElement("td");
			tdCod.innerHTML =
				'<span class="prod-codigo">' + esc(p.sku_primeiro || "---") + "</span>";
			tr.appendChild(tdCod);

			// 2: Nome
			var tdNome = document.createElement("td");
			tdNome.innerHTML =
				'<span class="prod-nome">' + esc(p.produto_nome) + "</span>";
			tr.appendChild(tdNome);

			// 3: Categoria (tags)
			var tdCat = document.createElement("td");
			var catsStr = p.categorias || "";
			if (catsStr) {
				var tags = catsStr
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				var tagsBox = document.createElement("div");
				tagsBox.className = "cat-tags";
				tags.forEach((t) => {
					var span = document.createElement("span");
					span.className = "cat-mini-tag";
					span.textContent = t;
					tagsBox.appendChild(span);
				});
				tdCat.appendChild(tagsBox);
			} else {
				tdCat.innerHTML = '<span class="cat-tags-empty">&mdash;</span>';
			}
			tr.appendChild(tdCat);

			// 4: Preço de Custo
			var tdCusto = document.createElement("td");
			var inpCusto = criarInputNumero(p.preco_custo, (val) => {
				p.preco_custo = val;
				debounceSalvar("cost", p.produto_id, val);
				renderizar();
			});
			tdCusto.appendChild(inpCusto);
			tr.appendChild(tdCusto);

			// 5: Impostos / Extras
			var tdImp = document.createElement("td");
			var inpImp = criarInputNumero(p.impostos_extras, (val) => {
				p.impostos_extras = val;
				debounceSalvar("taxes", p.produto_id, val);
				renderizar();
			});
			tdImp.appendChild(inpImp);
			tr.appendChild(tdImp);

			// 6: Custo Fixo (diluído)
			var tdCustoFixo = document.createElement("td");
			var custoFixoBox = document.createElement("label");
			custoFixoBox.className = "custo-fixo-toggle";
			var chkCustoFixo = document.createElement("input");
			chkCustoFixo.type = "checkbox";
			chkCustoFixo.checked = !!p.aplicar_custo_fixo;
			chkCustoFixo.title = "Diluir o custo fixo mensal neste produto";
			chkCustoFixo.addEventListener("change", () => {
				p.aplicar_custo_fixo = chkCustoFixo.checked;
				if (window.erpBanco.precificacao.salvarAplicarCustoFixo) {
					window.erpBanco.precificacao
						.salvarAplicarCustoFixo(p.produto_id, chkCustoFixo.checked)
						.catch((err) => mostrarMensagem("Erro ao salvar: " + err, "error"));
				}
				renderizar();
			});
			var custoFixoValor = document.createElement("span");
			custoFixoValor.textContent = p.aplicar_custo_fixo
				? fmtPct(custoFixoConfig.percentual) + "%"
				: "—";
			custoFixoBox.appendChild(chkCustoFixo);
			custoFixoBox.appendChild(custoFixoValor);
			tdCustoFixo.appendChild(custoFixoBox);
			tr.appendChild(tdCustoFixo);

			// 7: Margem (%)
			var tdMarg = document.createElement("td");
			var inpMarg = criarInputNumero(
				margemReal,
				(val) => {
					var novoPreco = calcPrecoVenda(p.preco_custo, p.impostos_extras, val, custoFixoAplicado);
					p.margem_percentual = val;
					p.preco_venda = novoPreco;
					debounceSalvarMargemPreco(p.produto_id, val, novoPreco);
					renderizar();
				},
				{ min: 0, max: 999, step: 0.1, isPorcento: true },
			);
			inpMarg.setAttribute(
				"placeholder",
				"Global " + fmtPct(globalMargin) + "%",
			);
			tdMarg.appendChild(inpMarg);
			tr.appendChild(tdMarg);

			// 8: Preço de Venda
			var tdPreco = document.createElement("td");
			var inpPreco = criarInputNumero(
				precoCalculado,
				(val) => {
					var novaMargem = calcMargem(p.preco_custo, p.impostos_extras, val, custoFixoAplicado);
					p.margem_percentual = novaMargem;
					p.preco_venda = val;
					debounceSalvarMargemPreco(p.produto_id, novaMargem, val);
					renderizar();
				},
				{ min: 0, step: 0.01 },
			);
			tdPreco.appendChild(inpPreco);
			tr.appendChild(tdPreco);

			// 8: Lucro (R$)
			var tdLucro = document.createElement("td");
			var cl =
				lucro > 0
					? "lucro-positivo"
					: lucro < 0
						? "lucro-negativo"
						: "lucro-zero";
			tdLucro.innerHTML =
				'<span class="' + cl + '">R$ ' + esc(fmtMoeda(lucro)) + "</span>";
			tr.appendChild(tdLucro);

			// 9: Status
			var tdStatus = document.createElement("td");
			var usaC =
				p.margem_percentual !== null && p.margem_percentual !== undefined;
			if (usaC) {
				tdStatus.innerHTML =
					'<span class="margem-tag margem-custom">Custom (' +
					esc(fmtPct(p.margem_percentual)) +
					"%)</span>";
			} else {
				tdStatus.innerHTML =
					'<span class="margem-tag margem-global">Global (' +
					esc(fmtPct(globalMargin)) +
					"%)</span>";
			}
			tr.appendChild(tdStatus);

			tbody.appendChild(tr);
		});

		atualizarMassBar();
	}

	function criarInputNumero(valor, onChange, opts) {
		opts = opts || {};
		var inp = document.createElement("input");
		inp.type = "number";
		inp.min = opts.min !== undefined ? opts.min : 0;
		if (opts.max !== undefined) inp.max = opts.max;
		inp.step = opts.step !== undefined ? opts.step : 0.01;
		inp.value = arredonda(valor, opts.isPorcento ? 1 : 2);
		inp.addEventListener("change", () => {
			var v = parseFloat(inp.value);
			if (isNaN(v)) v = 0;
			if (opts.min !== undefined && v < opts.min) v = opts.min;
			if (opts.max !== undefined && v > opts.max) v = opts.max;
			onChange(v);
		});
		return inp;
	}

	function arredonda(v, casas) {
		return parseFloat(Number(v || 0).toFixed(casas));
	}

	/* ==================== Debounce save ==================== */

	function debounceSalvar(tipo, produtoId, valor) {
		var key = tipo + "_" + produtoId;
		clearTimeout(debounceTimers[key]);
		debounceTimers[key] = setTimeout(() => {
			var fn = null;
			if (tipo === "cost") fn = window.erpBanco.precificacao.salvarCusto;
			else if (tipo === "taxes")
				fn = window.erpBanco.precificacao.salvarImpostos;
			if (fn)
				fn.call(window.api, produtoId, valor).catch((err) => {
					mostrarMensagem("Erro ao salvar: " + err, "error");
				});
		}, 400);
	}

	function debounceSalvarMargemPreco(produtoId, margem, preco) {
		var key = "mp_" + produtoId;
		clearTimeout(debounceTimers[key]);
		debounceTimers[key] = setTimeout(() => {
			var p1 = window.erpBanco.precificacao.salvarMargemProduto(
				produtoId,
				margem,
			);
			var p2 = window.erpBanco.precificacao.salvarPreco(produtoId, preco);
			Promise.all([p1, p2]).catch((err) => {
				mostrarMensagem("Erro ao salvar: " + err, "error");
			});
		}, 400);
	}

	/* ==================== Mass update ==================== */

	function getLinhasSelecionadas() {
		var checks = tbody.querySelectorAll(".row-check:checked");
		return Array.prototype.map.call(checks, (cb) => parseInt(cb.value, 10));
	}

	function atualizarMassBar() {
		var ids = getLinhasSelecionadas();
		if (ids.length > 0) {
			massBar.style.display = "flex";
			massCount.textContent =
				ids.length +
				" ite" +
				(ids.length === 1 ? "m" : "ns") +
				" selecionado" +
				(ids.length === 1 ? "" : "s");
		} else {
			massBar.style.display = "none";
		}
	}

	selectAll.addEventListener("change", () => {
		var checked = selectAll.checked;
		tbody.querySelectorAll(".row-check").forEach((c) => {
			c.checked = checked;
		});
		atualizarMassBar();
	});

	btnMassApply.addEventListener("click", () => {
		var ids = getLinhasSelecionadas();
		if (ids.length === 0) {
			mostrarMensagem("Selecione ao menos um produto.", "error");
			return;
		}
		var margem = parseFloat(massMargin.value);
		if (isNaN(margem) || margem < 0) {
			mostrarMensagem("Informe uma margem válida.", "error");
			return;
		}
		if (!window.api || !window.erpBanco.precificacao.aplicarMargemEmLote) {
			mostrarMensagem("API indisponível.", "error");
			return;
		}
		btnMassApply.disabled = true;
		window.erpBanco.precificacao
			.aplicarMargemEmLote(ids, margem)
			.then((r) => {
				mostrarMensagem(
					"Margem de " + margem + "% aplicada a " + r.count + " produto(s)!",
					"success",
				);
				carregar();
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "error");
			})
			.then(() => {
				btnMassApply.disabled = false;
				massMargin.value = "";
			});
	});

	/* ==================== Global margin ==================== */

	btnSaveGlobal.addEventListener("click", () => {
		var val = parseFloat(globalMarginInput.value);
		if (isNaN(val) || val < 0) {
			mostrarMensagem("Informe uma margem válida.", "error");
			return;
		}
		if (!window.api || !window.erpBanco.precificacao.salvarMargemGlobal) {
			mostrarMensagem("API indisponível.", "error");
			return;
		}
		btnSaveGlobal.disabled = true;
		window.erpBanco.precificacao
			.salvarMargemGlobal(val)
			.then(() => {
				globalMargin = val;
				renderizar();
				mostrarMensagem(
					"Margem global atualizada para " + val + "%!",
					"success",
				);
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "error");
			})
			.then(() => {
				btnSaveGlobal.disabled = false;
			});
	});

	/* ==================== Custos Fixos ==================== */

	function atualizarCustoFixoResultado() {
		if (custoFixoConfig.mesesConsiderados === 0) {
			custoFixoResultado.innerHTML =
				'Ainda não há histórico de vendas suficiente para calcular automaticamente. ' +
				'Cadastre vendas ou <a href="../importacao/importacao.html" style="color:var(--cor-primaria);">importe um histórico</a>.';
			return;
		}
		if (custoFixoConfig.percentual > 0) {
			custoFixoResultado.textContent =
				"Faturamento médio dos últimos " + custoFixoConfig.mesesConsiderados +
				" mês(es): R$ " + fmtMoeda(custoFixoConfig.faturamentoMedioHistorico) +
				" — " + fmtPct(custoFixoConfig.percentual) + "% do faturamento será diluído nos produtos marcados.";
		} else {
			custoFixoResultado.textContent = "Informe o custo fixo mensal para calcular a porcentagem.";
		}
	}

	btnSaveCustoFixo.addEventListener("click", () => {
		var mensal = parseFloat(custoFixoMensalInput.value) || 0;
		if (mensal < 0) {
			mostrarMensagem("Informe um valor válido.", "error");
			return;
		}
		if (!window.api || !window.erpBanco.precificacao.salvarCustoFixoConfig) {
			mostrarMensagem("API indisponível.", "error");
			return;
		}
		btnSaveCustoFixo.disabled = true;
		window.erpBanco.precificacao
			.salvarCustoFixoConfig(mensal)
			.then(() => window.erpBanco.precificacao.custoFixoConfig())
			.then((config) => {
				custoFixoConfig = config;
				atualizarCustoFixoResultado();
				renderizar();
				mostrarMensagem("Custos fixos atualizados!", "success");
			})
			.catch((err) => {
				mostrarMensagem("Erro: " + err, "error");
			})
			.then(() => {
				btnSaveCustoFixo.disabled = false;
			});
	});

	/* ==================== Eventos filtros ==================== */
	searchInput.addEventListener("input", renderizar);
	filterCategoria.addEventListener("change", renderizar);

	/* ==================== Mensagens ==================== */
	function mostrarMensagem(texto, tipo) {
		mensagem.textContent = texto;
		mensagem.className =
			"mensagem " + (tipo === "success" ? "success" : "error");
		mensagem.style.display = "block";
		setTimeout(() => {
			mensagem.style.display = "none";
		}, 3500);
	}

	if (window.erpAuthPromise)
		window.erpAuthPromise.then(carregar).catch(() => {});
	else carregar();
})();
