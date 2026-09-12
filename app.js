import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, push, remove, update } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCEwDKZonaRqLQtZf4_5xSobNOH-bl6jcE",
    authDomain: "lojinha-virtual-1c7b0.firebaseapp.com",
    databaseURL: "https://lojinha-virtual-1c7b0-default-rtdb.firebaseio.com",
    projectId: "lojinha-virtual-1c7b0"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let currentUser = null;
let dbProgramacoes = {};
let dbAgendamentos = {};
let dbUsuarios = {};
let dbSemanal = {};
let dbEspeciais = {};
let progSelecionada = null; 
let graficoInstancia = null;

// --- FUNÇÕES AUXILIARES ---
function sanitizeKey(username) { return username.trim().replace(/\./g, '_').toLowerCase(); }

function temPermissaoUsuarios() {
    return currentUser && (currentUser.role === 'super_admin' || (currentUser.role === 'admin' && currentUser.podeGerenciarUsuarios));
}
function isAdmin() { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin'); }

function getHojeFormatado() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
}
function formatarDataBR(dataIso) {
    const p = dataIso.split('-'); if(p.length !== 3) return dataIso;
    return `${p[2]}/${p[1]}/${p[0]}`;
}

// GERA BOTÕES DO ADMIN
function gerarBotoesAdmin() {
    if (!isAdmin()) return;
    const navs = document.querySelectorAll('.admin-nav-buttons');
    const htmlBotoes = `
        <button onclick="window.showView('admin-view')" class="btn-salvar" style="background:#2c3e50;">📅 Agendas</button>
        <button onclick="window.showView('admin-semanal-view')" class="btn-salvar" style="background:#2980b9;">📅 Prog. Semanal</button>
        <button onclick="window.showView('admin-especiais-view')" class="btn-salvar" style="background:#8e44ad;">⭐ Especiais</button>
        ${temPermissaoUsuarios() ? '<button onclick="window.showView(\'users-view\')" class="btn-alerta">👥 Usuários</button>' : ''}
        <button onclick="window.showView('dashboard-view')" class="btn-dash">📊 Dashboard</button>
        <button onclick="window.showView('user-view')" class="btn-secundario">📱 Tela User</button>
        <button onclick="window.sair()" class="btn-sair">Sair</button>
    `;
    navs.forEach(nav => nav.innerHTML = htmlBotoes);
}

// LOGICA DE TRANSIÇÃO ADMIN <-> USER (HEADER)
function atualizarVisibilidadeHeaders(viewId) {
    if (!currentUser) {
        document.getElementById('user-header').style.display = 'none';
        document.getElementById('admin-header').style.display = 'none';
        return;
    }
    
    // Identifica se a view aberta pertence ao lado do Usuário
    const isUserView = viewId.startsWith('user-');

    if (isAdmin()) {
        if (isUserView) {
            // Admin disfarçado de usuário
            document.getElementById('admin-header').style.display = 'none';
            document.getElementById('user-header').style.display = 'flex';
            document.getElementById('btn-voltar-admin').style.display = 'inline-flex';
        } else {
            // Admin em área de Admin
            document.getElementById('admin-header').style.display = 'flex';
            document.getElementById('user-header').style.display = 'none';
            gerarBotoesAdmin();
        }
    } else {
        // Usuário normal
        document.getElementById('admin-header').style.display = 'none';
        document.getElementById('user-header').style.display = 'flex';
        document.getElementById('btn-voltar-admin').style.display = 'none';
    }
}

// --- NAVEGAÇÃO ---
window.showView = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    localStorage.setItem('agendarView', viewId);
    
    atualizarVisibilidadeHeaders(viewId); // Atualiza os cabeçalhos conforme a tela
    
    if (viewId === 'dashboard-view') renderDashboardDetalhado();
    if (viewId.includes('user-') || viewId.includes('admin-')) atualizarTelas();
}

window.toggleCadastro = function() {
    const l = document.getElementById('form-login'), c = document.getElementById('form-cadastro'), t = document.getElementById('titulo-login');
    if (l.style.display === 'none') { l.style.display = 'block'; c.style.display = 'none'; t.innerText = "Entrar no Sistema"; } 
    else { l.style.display = 'none'; c.style.display = 'block'; t.innerText = "Criar Nova Conta"; }
}

// --- AUTENTICAÇÃO ---
window.fazerLogin = function() {
    const user = document.getElementById('username').value.trim(), pass = document.getElementById('password').value.trim();
    if(!user || !pass) return alert("Preencha usuário e senha");
    get(ref(database, `Agendar/usuarios/${sanitizeKey(user)}`)).then((s) => {
        if (s.exists() && s.val().senha === pass) entrarNoSistema(s.val());
        else alert("Usuário não encontrado ou Senha incorreta!");
    });
}
window.fazerCadastro = function() {
    const user = document.getElementById('new-username').value.trim(), pass = document.getElementById('new-password').value.trim();
    if(!user || !pass) return alert("Preencha todos os campos.");
    const key = sanitizeKey(user);
    get(ref(database, `Agendar/usuarios/${key}`)).then((s) => {
        if (s.exists()) alert("Este nome de usuário já existe. Escolha outro.");
        else set(ref(database, `Agendar/usuarios/${key}`), { usuario: user, senha: pass, role: 'user' }).then(() => {
            alert("Conta criada! Faça login."); window.toggleCadastro();
        });
    });
}

function entrarNoSistema(usuario) {
    currentUser = usuario;
    localStorage.setItem('agendarUser', JSON.stringify(currentUser)); 
    document.getElementById('nome-usuario').innerText = currentUser.usuario;
    document.getElementById('username').value = ''; document.getElementById('password').value = '';
    
    if (isAdmin()) {
        document.getElementById('admin-badge').innerHTML = currentUser.role === 'super_admin' ? '<span class="badge-super">Super</span>' : '<span class="badge-admin">Admin</span>';
        window.showView('admin-view'); // Manda para o dashboard do Admin
    } else {
        window.showView('user-view'); // Manda para a tela do Usuário
    }
}

window.sair = function() { 
    currentUser = null; 
    localStorage.removeItem('agendarUser'); 
    localStorage.removeItem('agendarView'); 
    window.showView('login-view'); 
    atualizarVisibilidadeHeaders('login-view'); // Esconde tudo
}
window.irParaAdmin = function() { window.showView('admin-view'); }
window.fecharModal = function(id) { document.getElementById(id).style.display = 'none'; }

// --- ATUALIZADOR GLOBAL DE TELAS ---
function atualizarTelas() {
    if (!currentUser) return;
    renderAgendasFixas();
    renderSemanal();
    renderEspeciais();
    if(temPermissaoUsuarios()) renderTabelaUsuarios();
}

// --- 1. AGENDAS DE VAGAS ---
function calcularVagasOcupadas(idProg) {
    let ocupadas = 0; Object.values(dbAgendamentos).forEach(a => { if (a.idProgramacao === idProg) ocupadas += 1 + (a.acompanhantes ? a.acompanhantes.length : 0); }); return ocupadas;
}
function dataParaOrdem(dataBR, hora) {
    const p = dataBR.split('/'); if (p.length !== 3) return 0;
    return parseInt(`${p[2]}${p[1]}${p[0]}${hora.replace(':','')}`);
}
function buscarMeuAgendamento() {
    for (let key in dbAgendamentos) if (dbAgendamentos[key].idUser === currentUser.usuario) return { id: key, dados: dbAgendamentos[key] };
    return null;
}

function renderAgendasFixas() {
    const tbody = document.getElementById('tabela-programacoes-body'), cards = document.getElementById('lista-programacoes');
    if(tbody) tbody.innerHTML = ''; if(cards) cards.innerHTML = '';
    
    let total = 0, vazios = 0;
    const meuAg = buscarMeuAgendamento();
    const aviso = document.getElementById('msg-meu-agendamento');
    if (meuAg && dbProgramacoes[meuAg.dados.idProgramacao]) {
        const p = dbProgramacoes[meuAg.dados.idProgramacao];
        aviso.style.display = 'block'; aviso.innerHTML = `Presença confirmada: <b>${p.titulo} - ${p.dia} às ${p.hora}</b>. Agendar outro substitui este.`;
    } else if(aviso) aviso.style.display = 'none';

    const progKeys = Object.keys(dbProgramacoes).sort((a,b) => dataParaOrdem(dbProgramacoes[a].dia, dbProgramacoes[a].hora) - dataParaOrdem(dbProgramacoes[b].dia, dbProgramacoes[b].hora));
    progKeys.forEach(k => {
        const p = dbProgramacoes[k], oc = calcularVagasOcupadas(k), rest = p.vagas - oc, esg = rest <= 0;
        total += oc; if (oc === 0) vazios++;

        if(tbody) {
            tbody.innerHTML += `<tr ${esg ? 'class="linha-sucesso"' : ''}>
                <td><strong>${p.titulo}</strong></td><td>${p.dia}</td><td>${p.hora}</td>
                <td>${esg ? '<span class="badge-verde">Completas</span>' : p.vagas}</td><td>${oc}</td>
                <td><button onclick="window.deletarProg('${k}')" class="btn-sair btn-small">Excluir</button></td></tr>`;
        }
        if(cards) {
            cards.innerHTML += `<div class="programacao-card">
                <div><h4>${p.titulo}</h4><p>🗓️ ${p.dia} &nbsp; ⏰ <strong>${p.hora}</strong></p></div>
                <div><p class="vagas" style="${esg ? 'color:#e74c3c; background:#fadbd8;' : ''}">${esg ? 'Esgotado' : rest + ' vagas disponíveis'}</p>
                <button onclick="window.abrirModalAgendar('${k}')" class="${esg ? 'btn-esgotado' : 'btn-agendar'}" ${esg ? 'disabled' : ''}>Agendar</button></div></div>`;
        }
    });
    document.getElementById('dash-total').innerText = total; document.getElementById('dash-vazios').innerText = vazios;
}

window.abrirModalAgendar = function(idProg) {
    if (buscarMeuAgendamento() && !confirm("Já possui horário. Alterar para este novo?")) return;
    progSelecionada = { id: idProg, ...dbProgramacoes[idProg] };
    document.getElementById('modal-titulo').innerText = progSelecionada.titulo;
    document.getElementById('modal-dia').innerText = progSelecionada.dia;
    document.getElementById('modal-horario').innerText = progSelecionada.hora;
    document.getElementById('vagas-restantes').innerText = progSelecionada.vagas - calcularVagasOcupadas(idProg);
    document.getElementById('qtd-acompanhantes').value = 0;
    document.getElementById('nomes-acompanhantes').innerHTML = '';
    document.getElementById('modal-agendamento').style.display = 'flex';
}

window.alterarAcompanhantes = function(valor) {
    const input = document.getElementById('qtd-acompanhantes');
    let n = parseInt(input.value) + valor, disp = progSelecionada.vagas - calcularVagasOcupadas(progSelecionada.id);
    if (n >= 0 && (n + 1) <= disp) {
        input.value = n; const c = document.getElementById('nomes-acompanhantes');
        if (valor > 0) {
            const inp = document.createElement('input'); inp.type = 'text'; inp.id = `acomp-${n}`; inp.placeholder = `Acompanhante ${n}`; inp.required = true; c.appendChild(inp);
        } else if (valor < 0) { const ult = document.getElementById(`acomp-${parseInt(input.value)+1}`); if (ult) c.removeChild(ult); }
    } else if (n + 1 > disp) alert(`Limite atingido. Restam ${disp} vagas.`);
}

window.salvarAgendamento = function() {
    const qtd = parseInt(document.getElementById('qtd-acompanhantes').value); let acomp = [];
    for (let i = 1; i <= qtd; i++) {
        const inp = document.getElementById(`acomp-${i}`);
        if(inp) { const n = inp.value.trim(); if (!n) return alert("Preencha todos."); acomp.push(n); }
    }
    const agAntigo = buscarMeuAgendamento(); if (agAntigo) remove(ref(database, `Agendar/agendamentos/${agAntigo.id}`));
    push(ref(database, 'Agendar/agendamentos'), { idUser: currentUser.usuario, idProgramacao: progSelecionada.id, acompanhantes: acomp }).then(() => {
        alert("Presença confirmada!"); window.fecharModal('modal-agendamento');
    });
}

window.abrirModalNovaProg = function() { document.getElementById('modal-nova-prog').style.display = 'flex'; }
window.salvarNovaProg = function() {
    const titulo = document.getElementById('prog-titulo').value, dia = document.getElementById('prog-data').value, hora = document.getElementById('prog-hora').value, vagas = parseInt(document.getElementById('prog-vagas').value);
    if(!titulo || !dia || !hora || !vagas) return alert("Preencha todos.");
    push(ref(database, 'Agendar/programacoes'), { titulo, dia: formatarDataBR(dia), hora, vagas }).then(() => { alert("Adicionado!"); window.fecharModal('modal-nova-prog'); });
}
window.deletarProg = function(id) {
    if(confirm("Deseja excluir?")) { remove(ref(database, `Agendar/programacoes/${id}`)); for (let k in dbAgendamentos) if(dbAgendamentos[k].idProgramacao === id) remove(ref(database, `Agendar/agendamentos/${k}`)); }
}
window.limparTudo = function() {
    if(confirm("Apagar TODOS horários e agendamentos?") && confirm("Última confirmação. Posso zerar?")) { remove(ref(database, 'Agendar/programacoes')); remove(ref(database, 'Agendar/agendamentos')); alert("Zerado!"); }
}

window.abrirModal24h = function() { document.getElementById('modal-24h').style.display = 'flex'; }
window.gerarRelogio24h = function() {
    const tit = document.getElementById('prog24-titulo').value || "Relógio de Oração", dIn = document.getElementById('prog24-data').value, hIn = document.getElementById('prog24-hora').value, v = parseInt(document.getElementById('prog24-vagas').value);
    if(!dIn || !hIn || !v) return alert("Preencha Data, Hora e Vagas.");
    const [ano, mes, dia] = dIn.split('-'), [h, m] = hIn.split(':'); let dAtual = new Date(ano, mes - 1, dia, h, m);
    for(let i = 0; i <= 24; i++) {
        let d = String(dAtual.getDate()).padStart(2, '0'), ms = String(dAtual.getMonth() + 1).padStart(2, '0'), hr = String(dAtual.getHours()).padStart(2, '0'), mn = String(dAtual.getMinutes()).padStart(2, '0');
        push(ref(database, 'Agendar/programacoes'), { titulo: tit, dia: `${d}/${ms}/${dAtual.getFullYear()}`, hora: `${hr}:${mn}`, vagas: v });
        dAtual.setHours(dAtual.getHours() + 1);
    }
    alert("Gerado!"); window.fecharModal('modal-24h');
}

// --- 2. LÓGICA DE DETALHES DINÂMICOS E IMAGENS ---
window.mudarTipoImg = function(prefix) {
    const tipo = document.getElementById(`${prefix}-tipo-img`).value;
    document.getElementById(`${prefix}-img-url`).style.display = tipo === 'url' ? 'block' : 'none';
    document.getElementById(`${prefix}-img-local`).style.display = tipo === 'local' ? 'block' : 'none';
}
window.converterBase64 = function(element, prefix) {
    let file = element.files[0], reader = new FileReader();
    reader.onloadend = function() { document.getElementById(`${prefix}-img-base64`).value = reader.result; }
    if(file) reader.readAsDataURL(file);
}
window.adicionarDetalhe = function(prefix) {
    const container = document.getElementById(`${prefix}-detalhes-container`);
    const id = Date.now();
    container.insertAdjacentHTML('beforeend', `
        <div class="detalhe-item" id="det-${id}">
            <input type="text" class="${prefix}-input-det" placeholder="Ex: Intercessão">
            <button onclick="document.getElementById('det-${id}').remove()" class="btn-remove-detalhe">X</button>
        </div>
    `);
}
function pegarDetalhes(prefix) {
    const inputs = document.querySelectorAll(`.${prefix}-input-det`);
    let arr = []; inputs.forEach(i => { if(i.value.trim()) arr.push(i.value.trim()); }); return arr;
}
function pegarImagem(prefix) {
    const tipo = document.getElementById(`${prefix}-tipo-img`).value;
    if(tipo === 'url') return document.getElementById(`${prefix}-img-url`).value.trim();
    if(tipo === 'local') return document.getElementById(`${prefix}-img-base64`).value;
    return "";
}
function limparCamposImgEDet(prefix) {
    document.getElementById(`${prefix}-tipo-img`).value = 'none'; window.mudarTipoImg(prefix);
    document.getElementById(`${prefix}-img-url`).value = ''; document.getElementById(`${prefix}-img-local`).value = ''; document.getElementById(`${prefix}-img-base64`).value = '';
    document.getElementById(`${prefix}-detalhes-container`).innerHTML = '';
}

// --- 3. PROGRAMAÇÃO SEMANAL ---
window.abrirModalSemanal = function() { limparCamposImgEDet('sem'); document.getElementById('sem-hora').value = ''; document.getElementById('modal-semanal').style.display = 'flex'; }
window.salvarProgSemanal = function() {
    const dia = document.getElementById('sem-dia').value, hora = document.getElementById('sem-hora').value;
    if(!hora) return alert("Preencha o horário.");
    const img = pegarImagem('sem'), detalhes = pegarDetalhes('sem');
    push(ref(database, 'Agendar/semanal'), { dia, hora, img, detalhes }).then(() => { alert("Salvo!"); window.fecharModal('modal-semanal'); });
}
window.excluirSemanal = function(k) { if(confirm("Excluir?")) remove(ref(database, `Agendar/semanal/${k}`)); }

function renderSemanal() {
    const adm = document.getElementById('tabela-semanal-admin'), usr = document.getElementById('lista-semanal-user');
    if(adm) adm.innerHTML = ''; if(usr) usr.innerHTML = '';
    
    const ordemDias = {"Segunda-feira":1,"Terça-feira":2,"Quarta-feira":3,"Quinta-feira":4,"Sexta-feira":5,"Sábado":6,"Domingo":7};
    const keys = Object.keys(dbSemanal).sort((a,b) => {
        if(ordemDias[dbSemanal[a].dia] !== ordemDias[dbSemanal[b].dia]) return ordemDias[dbSemanal[a].dia] - ordemDias[dbSemanal[b].dia];
        return dbSemanal[a].hora.localeCompare(dbSemanal[b].hora);
    });

    keys.forEach(k => {
        const item = dbSemanal[k];
        let imgHtml = item.img ? `<img src="${item.img}" class="card-img" alt="Capa">` : '';
        let listHtml = item.detalhes ? `<ul class="lista-detalhes">${item.detalhes.map(d=>`<li>• ${d}</li>`).join('')}</ul>` : '';

        if(adm) {
            adm.innerHTML += `<tr><td><strong>${item.dia}</strong></td><td>${item.hora}</td>
                <td>${item.img ? 'Sim' : 'Não'}</td><td>${item.detalhes ? item.detalhes.length : 0}</td>
                <td><button onclick="window.excluirSemanal('${k}')" class="btn-sair btn-small">Excluir</button></td></tr>`;
        }
        if(usr) {
            usr.innerHTML += `<div class="programacao-card">
                <div>${imgHtml}<h4>${item.dia}</h4><p>⏰ <strong>${item.hora}</strong></p>${listHtml}</div>
            </div>`;
        }
    });
}

// --- 4. PROGRAMAÇÕES ESPECIAIS ---
window.abrirModalEspecial = function() { 
    limparCamposImgEDet('esp'); document.getElementById('esp-titulo').value = ''; document.getElementById('esp-data-inicio').value = ''; 
    document.getElementById('esp-data-fim').value = ''; document.getElementById('esp-hora').value = ''; document.getElementById('modal-especial').style.display = 'flex'; 
}
window.salvarProgEspecial = function() {
    const titulo = document.getElementById('esp-titulo').value, start = document.getElementById('esp-data-inicio').value, end = document.getElementById('esp-data-fim').value, hora = document.getElementById('esp-hora').value;
    if(!titulo || !start || !end) return alert("Preencha título e datas.");
    if(end < start) return alert("A data final não pode ser antes da inicial.");
    const img = pegarImagem('esp'), detalhes = pegarDetalhes('esp');
    push(ref(database, 'Agendar/especiais'), { titulo, dataInicio: start, dataFim: end, hora, img, detalhes }).then(() => { alert("Salvo!"); window.fecharModal('modal-especial'); });
}
window.excluirEspecial = function(k) { if(confirm("Excluir evento?")) remove(ref(database, `Agendar/especiais/${k}`)); }

function renderEspeciais() {
    const adm = document.getElementById('tabela-especiais-admin'), usr = document.getElementById('lista-especiais-user');
    if(adm) adm.innerHTML = ''; if(usr) usr.innerHTML = '';
    
    const hoje = getHojeFormatado();
    const keys = Object.keys(dbEspeciais).sort((a,b) => dbEspeciais[a].dataInicio.localeCompare(dbEspeciais[b].dataInicio));

    keys.forEach(k => {
        const item = dbEspeciais[k];
        const statusAdm = hoje > item.dataFim ? '<span style="color:#e74c3c;font-weight:bold;">Expirado</span>' : '<span style="color:#27ae60;font-weight:bold;">Ativo</span>';
        
        if(adm) {
            adm.innerHTML += `<tr><td><strong>${item.titulo}</strong></td><td>${formatarDataBR(item.dataInicio)}</td><td>${formatarDataBR(item.dataFim)}</td>
                <td>${item.hora||'--'}</td><td>${statusAdm}</td><td><button onclick="window.excluirEspecial('${k}')" class="btn-sair btn-small">Excluir</button></td></tr>`;
        }

        if(usr && hoje <= item.dataFim) {
            let badge = '';
            if(hoje === item.dataInicio && hoje === item.dataFim) badge = `<span class="badge-destaque">Acontece Hoje!</span>`;
            else if(hoje === item.dataInicio) badge = `<span class="badge-destaque">Começa Hoje!</span>`;
            else if(hoje === item.dataFim) badge = `<span class="badge-destaque badge-termina">Termina Hoje!</span>`;

            let imgHtml = item.img ? `<img src="${item.img}" class="card-img" alt="Capa">` : '';
            let listHtml = item.detalhes ? `<ul class="lista-detalhes">${item.detalhes.map(d=>`<li>• ${d}</li>`).join('')}</ul>` : '';
            let horaHtml = item.hora ? `<p>⏰ <strong>${item.hora}</strong></p>` : '';

            usr.innerHTML += `<div class="programacao-card">
                ${badge}<div>${imgHtml}<h4>${item.titulo}</h4>
                <p style="font-size:14px; margin-bottom:5px;">🗓️ ${formatarDataBR(item.dataInicio)} até ${formatarDataBR(item.dataFim)}</p>
                ${horaHtml}${listHtml}</div>
            </div>`;
        }
    });
}

// --- DASHBOARD GRÁFICOS (REUTILIZADO) ---
window.renderDashboardDetalhado = function() {
    const dashTbody = document.getElementById('tabela-dashboard-body'); if(!dashTbody) return; dashTbody.innerHTML = '';
    const progKeys = Object.keys(dbProgramacoes).sort((a,b) => dataParaOrdem(dbProgramacoes[a].dia, dbProgramacoes[a].hora) - dataParaOrdem(dbProgramacoes[b].dia, dbProgramacoes[b].hora));
    let labels = [], dadosOc = [], dadosCap = [];
    progKeys.forEach(k => {
        const p = dbProgramacoes[k], oc = calcularVagasOcupadas(k);
        labels.push(`${p.dia.substring(0,5)} ${p.hora}`); dadosOc.push(oc); dadosCap.push(p.vagas);
        dashTbody.innerHTML += `<tr><td><strong>${p.titulo}</strong></td><td>${p.dia} às ${p.hora}</td><td>${oc} / ${p.vagas}</td><td><button onclick="window.verPessoasModal('${k}')" class="btn-secundario btn-small">👁️ Ver Pessoas</button></td></tr>`;
    });
    const ctx = document.getElementById('graficoOcupacao'); if(!ctx) return;
    if (graficoInstancia) graficoInstancia.destroy(); 
    graficoInstancia = new Chart(ctx.getContext('2d'), {
        type: 'bar', data: { labels: labels, datasets: [
            { label: 'Confirmadas', data: dadosOc, backgroundColor: '#27ae60', borderRadius: 4 },
            { label: 'Livres', data: dadosCap.map((v, i) => v - dadosOc[i]), backgroundColor: '#ecf0f1', borderRadius: 4 }
        ]}, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });
}
window.verPessoasModal = function(idProg) {
    const p = dbProgramacoes[idProg]; document.getElementById('pessoas-titulo').innerText = `${p.titulo} - ${p.dia} às ${p.hora}`;
    const lb = document.getElementById('lista-pessoas-body'); lb.innerHTML = ''; let tem = false;
    for (let k in dbAgendamentos) if (dbAgendamentos[k].idProgramacao === idProg) {
        tem = true; const a = dbAgendamentos[k], ns = (a.acompanhantes && a.acompanhantes.length > 0) ? a.acompanhantes.join(', ') : '<i>Nenhum</i>', t = 1 + (a.acompanhantes ? a.acompanhantes.length : 0);
        lb.innerHTML += `<tr><td><strong>${a.idUser}</strong></td><td>${ns}</td><td>${t}</td></tr>`;
    }
    if(!tem) lb.innerHTML = '<tr><td colspan="3" style="text-align:center;">Vazio.</td></tr>';
    document.getElementById('modal-ver-pessoas').style.display = 'flex';
}

// --- USUÁRIOS ---
window.toggleUserPerms = function() { document.getElementById('user-perms-div').style.display = document.getElementById('user-role').value === 'admin' ? 'block' : 'none'; }
function renderTabelaUsuarios() {
    const tb = document.getElementById('tabela-usuarios-body'); if(!tb) return; tb.innerHTML = '';
    for (let k in dbUsuarios) {
        const u = dbUsuarios[k], b = u.role === 'super_admin' ? '<span class="badge-super">Super</span>' : (u.role === 'admin' ? `<span class="badge-admin">Admin</span> ${u.podeGerenciarUsuarios ? '👑' : ''}` : 'Usuário');
        const ac = u.role === 'super_admin' ? `<i>Protegido</i>` : `<button onclick="window.abrirModalUsuario('${k}')" class="btn-secundario btn-small">Editar</button> <button onclick="window.excluirUsuario('${k}')" class="btn-sair btn-small">Excluir</button>`;
        tb.innerHTML += `<tr><td><strong>${u.usuario}</strong></td><td>${u.senha}</td><td>${b}</td><td><div class="flex-between">${ac}</div></td></tr>`;
    }
}
window.abrirModalUsuario = function(k = null) {
    document.getElementById('user-key-edit').value = ''; document.getElementById('user-nome').value = ''; document.getElementById('user-senha').value = ''; document.getElementById('user-role').value = 'user'; document.getElementById('user-perm-manage').checked = false; window.toggleUserPerms();
    if (k && dbUsuarios[k]) {
        document.getElementById('titulo-modal-user').innerText = 'Editar Usuário'; document.getElementById('user-key-edit').value = k; document.getElementById('user-nome').value = dbUsuarios[k].usuario; document.getElementById('user-nome').disabled = true; document.getElementById('user-senha').value = dbUsuarios[k].senha; document.getElementById('user-role').value = dbUsuarios[k].role; document.getElementById('user-perm-manage').checked = dbUsuarios[k].podeGerenciarUsuarios || false; window.toggleUserPerms();
    } else { document.getElementById('titulo-modal-user').innerText = 'Novo Usuário'; document.getElementById('user-nome').disabled = false; }
    document.getElementById('modal-usuario').style.display = 'flex';
}
window.salvarUsuarioAdmin = function() {
    const e = document.getElementById('user-key-edit').value, n = document.getElementById('user-nome').value.trim(), s = document.getElementById('user-senha').value.trim(), r = document.getElementById('user-role').value, p = document.getElementById('user-perm-manage').checked;
    if(!n || !s) return alert("Preencha Usuário e Senha."); const kF = e ? e : sanitizeKey(n);
    if (!e && dbUsuarios[kF]) return alert("Usuário já existe.");
    const load = { usuario: n, senha: s, role: r }; if(r === 'admin') load.podeGerenciarUsuarios = p;
    update(ref(database, `Agendar/usuarios/${kF}`), load).then(() => { alert("Salvo!"); window.fecharModal('modal-usuario'); });
}
window.excluirUsuario = function(k) { if(confirm("Excluir?")) { remove(ref(database, `Agendar/usuarios/${k}`)); for(let a in dbAgendamentos) if(dbAgendamentos[a].idUser === dbUsuarios[k].usuario) remove(ref(database, `Agendar/agendamentos/${a}`)); } }

// --- BOOTSTRAP ---
function inicializarSistema() {
    get(ref(database, 'Agendar/usuarios/au_costa')).then((s) => { if (!s.exists()) set(ref(database, 'Agendar/usuarios/au_costa'), { usuario: 'au.costa', senha: '80605276', role: 'super_admin' }); });
    
    onValue(ref(database, 'Agendar/programacoes'), (s) => { dbProgramacoes = s.val() || {}; atualizarTelas(); });
    onValue(ref(database, 'Agendar/agendamentos'), (s) => { dbAgendamentos = s.val() || {}; atualizarTelas(); });
    onValue(ref(database, 'Agendar/semanal'), (s) => { dbSemanal = s.val() || {}; atualizarTelas(); });
    onValue(ref(database, 'Agendar/especiais'), (s) => { dbEspeciais = s.val() || {}; atualizarTelas(); });
    onValue(ref(database, 'Agendar/usuarios'), (s) => {
        dbUsuarios = s.val() || {};
        if(currentUser) { 
            const my = sanitizeKey(currentUser.usuario); 
            if(dbUsuarios[my]) { 
                currentUser = dbUsuarios[my]; 
                localStorage.setItem('agendarUser', JSON.stringify(currentUser)); 
                if (isAdmin()) document.getElementById('admin-badge').innerHTML = currentUser.role === 'super_admin' ? '<span class="badge-super">Super</span>' : '<span class="badge-admin">Admin</span>';
            } else { window.sair(); return; }
        }
        if(temPermissaoUsuarios()) renderTabelaUsuarios();
    });

    const su = localStorage.getItem('agendarUser'); 
    if (su) { 
        currentUser = JSON.parse(su); 
        document.getElementById('nome-usuario').innerText = currentUser.usuario; 
        
        if (isAdmin()) document.getElementById('admin-badge').innerHTML = currentUser.role === 'super_admin' ? '<span class="badge-super">Super</span>' : '<span class="badge-admin">Admin</span>';
        
        const vs = localStorage.getItem('agendarView') || (isAdmin() ? 'admin-view' : 'user-view');
        window.showView(vs); 
    }
}
inicializarSistema();