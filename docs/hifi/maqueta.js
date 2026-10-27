(function(){
var b=document.body,s=document.getElementById('rx-estado'),w=document.getElementById('rx-ancho'),m=document.querySelector('.rx-marco');
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function apply(){var o=s.options[s.selectedIndex],v=o.value,name=o.getAttribute('data-name');
 document.querySelectorAll('[data-show]').forEach(function(e){e.hidden=e.getAttribute('data-show')!==v});
 document.querySelectorAll('[data-show-in]').forEach(function(e){e.hidden=e.getAttribute('data-show-in')!==name&&e.getAttribute('data-show-in2')!==name});
 document.querySelectorAll('[data-hide-in]').forEach(function(e){e.hidden=e.getAttribute('data-hide-in')===name||e.getAttribute('data-hide-in2')===name});
 var hide=o.hasAttribute('data-hide');document.querySelectorAll('.rx-marco [data-list]').forEach(function(e){e.hidden=hide});
 b.classList.toggle('is-busy',o.hasAttribute('data-busy'));
 document.querySelectorAll('[data-busy]').forEach(function(e){if(o.hasAttribute('data-busy'))e.setAttribute('aria-busy','true');else e.removeAttribute('aria-busy')});}
if(s){s.addEventListener('change',apply);apply();}
if(w&&m){var sv=get('rx-ancho-'+(m.classList.contains('nx-sup-app')?'app':'portal'));if(sv&&w.querySelector('option[value="'+sv+'"]'))w.value=sv;
 function aw(){m.setAttribute('data-w',w.value);put('rx-ancho-'+(m.classList.contains('nx-sup-app')?'app':'portal'),w.value)}w.addEventListener('change',aw);aw();}
var t=document.getElementById('rx-tema');function at(d){b.classList.toggle('dark',d);if(t){t.setAttribute('aria-pressed',d);t.textContent=d?'Tema claro':'Tema oscuro'}}
at(get('rx-tema')==='dark');if(t)t.addEventListener('click',function(){var d=!b.classList.contains('dark');at(d);put('rx-tema',d?'dark':'light')});
document.querySelectorAll('.rx-tema-app').forEach(function(x){function lbl(){x.setAttribute('aria-label',b.classList.contains('dark')?'Cambiar a tema claro':'Cambiar a tema oscuro')}lbl();
 x.addEventListener('click',function(){var d=!b.classList.contains('dark');at(d);put('rx-tema',d?'dark':'light');document.querySelectorAll('.rx-tema-app').forEach(function(y){y.setAttribute('aria-label',d?'Cambiar a tema claro':'Cambiar a tema oscuro')})})});
document.querySelectorAll('.nx-shell').forEach(function(sh){if(sh.closest('.rx-fondo'))return;
 var mb=sh.querySelector('.rx-menu'),nav=sh.querySelector('.nx-nav');if(!mb||!nav)return;
 function set(o){sh.classList.toggle('nav-open',o);mb.setAttribute('aria-expanded',o);if(o){var f=nav.querySelector('.nx-nav__item');if(f)f.focus()}else mb.focus()}
 mb.addEventListener('click',function(){set(!sh.classList.contains('nav-open'))});
 sh.querySelector('.nx-nav__cerrar').addEventListener('click',function(){set(false)});
 sh.querySelector('.nx-nav-scrim').addEventListener('click',function(){set(false)});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sh.classList.contains('nav-open'))set(false)});});
var hideMs=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nx-motion-delay-hide'))||0;
document.querySelectorAll('.nx-scroll').forEach(function(el){var t;el.addEventListener('scroll',function(){el.classList.add('is-scrolling');clearTimeout(t);t=setTimeout(function(){el.classList.remove('is-scrolling')},hideMs)},{passive:true})});
document.querySelectorAll('.nx-menu-wrap').forEach(function(w){var b=w.querySelector('.rx-menu-btn'),m=w.querySelector('.nx-menu');
 function set(o){m.hidden=!o;b.setAttribute('aria-expanded',o)}
 b.addEventListener('click',function(e){e.stopPropagation();set(m.hidden)});
 m.addEventListener('click',function(e){e.stopPropagation();var c=e.target.closest('.nx-casilla');if(c&&!c.classList.contains('is-disabled')){e.preventDefault();var on=c.classList.toggle('is-on');c.setAttribute('aria-checked',on)}});
 document.addEventListener('click',function(){set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!m.hidden){set(false);b.focus()}});});
var n=document.getElementById('rx-notas');if(n)n.addEventListener('click',function(){var on=b.classList.toggle('show-notes');n.setAttribute('aria-pressed',on)});
})();
