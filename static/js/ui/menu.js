/* ══════════════════════════════════════════════════════════════════════════════
   YT TRACKER — CONTEXT MENU ENGINE (ui/menu.js)
   Singleton Action Dropdown for Table Rows & Cards
   ══════════════════════════════════════════════════════════════════════════════ */

(function () {
  let activeMenu = null;

  function closeMenu() {
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
  }

  document.addEventListener('click', function (e) {
    if (activeMenu && !activeMenu.contains(e.target) && !e.target.closest('.row-menu-btn')) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeMenu();
    }
  });

  window.closeRowMenu = closeMenu;

  window.showChannelRowMenu = function (e, channelId) {
    e.stopPropagation();
    e.preventDefault();
    closeMenu();

    const ch = (typeof all !== 'undefined') ? all.find(c => c.id === channelId) : null;
    if (!ch) return;

    const inCompare = (typeof compareSet !== 'undefined') && compareSet.includes(channelId);
    const isPrimary = !!ch.is_primary;

    const menu = document.createElement('div');
    menu.className = 'ui-dropdown-menu rev in';
    menu.innerHTML = `
      <button class="ui-menu-item" onclick="closeRowMenu(); openDeepDive('${channelId}', 'overview')">
        <i data-lucide="compass" style="width:14px;height:14px"></i>
        <span>View Channel Details</span>
      </button>
      ${!isPrimary ? `
      <button class="ui-menu-item" onclick="closeRowMenu(); toggleCompare('${channelId}')">
        <i data-lucide="${inCompare ? 'check' : 'git-compare'}" style="width:14px;height:14px"></i>
        <span>${inCompare ? 'Remove from Compare' : 'Add to Compare'}</span>
      </button>
      <button class="ui-menu-item" onclick="closeRowMenu(); setPrimary('${channelId}')">
        <i data-lucide="star" style="width:14px;height:14px"></i>
        <span>Set as Primary Channel</span>
      </button>` : ''}
      <button class="ui-menu-item" onclick="closeRowMenu(); window.open('https://youtube.com/${ch.handle ? ch.handle : 'channel/' + channelId}', '_blank')">
        <i data-lucide="external-link" style="width:14px;height:14px"></i>
        <span>Open on YouTube</span>
      </button>
      ${!isPrimary ? `
      <div class="ui-menu-divider"></div>
      <button class="ui-menu-item danger" onclick="closeRowMenu(); deleteChannel('${channelId}')">
        <i data-lucide="user-x" style="width:14px;height:14px"></i>
        <span>Stop Tracking Channel</span>
      </button>` : ''}
    `;

    document.body.appendChild(menu);
    if (window.lucide) window.lucide.createIcons();

    // Position menu near the click target
    const rect = e.currentTarget.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    let top = rect.bottom + 4;
    let left = rect.right - menuRect.width;

    if (left < 10) left = 10;
    if (top + menuRect.height > window.innerHeight - 10) {
      top = rect.top - menuRect.height - 4;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    activeMenu = menu;
  };
})();
