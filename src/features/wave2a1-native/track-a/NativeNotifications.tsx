import { Bell, ChevronRight } from 'lucide-react';
import { useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { NativePageHeader, NativePageTransition } from './NativePage';
import {
  NATIVE_NOTIFICATION_TABS,
  groupNativeNotifications,
  type NativeNotificationItem,
  type NativeNotificationTab,
} from './model';

export interface NativeNotificationsPageProps {
  activeTab: NativeNotificationTab;
  items: readonly NativeNotificationItem[];
  onBack: () => void;
  onOpenNotification: (item: NativeNotificationItem) => void;
  onTabChange: (tab: NativeNotificationTab) => void;
}

export function NativeNotificationsPage({
  activeTab,
  items,
  onBack,
  onOpenNotification,
  onTabChange,
}: NativeNotificationsPageProps) {
  const panelId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sections = useMemo(
    () => groupNativeNotifications(items, activeTab),
    [activeTab, items],
  );
  const activeIndex = NATIVE_NOTIFICATION_TABS.findIndex((tab) => tab.id === activeTab);

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % NATIVE_NOTIFICATION_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + NATIVE_NOTIFICATION_TABS.length)
        % NATIVE_NOTIFICATION_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = NATIVE_NOTIFICATION_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    onTabChange(NATIVE_NOTIFICATION_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <NativePageTransition>
      <main
        className="w2a1-a-root w2a1-a-detail-page"
        data-testid="wave2a1-native-notifications"
      >
        <NativePageHeader onBack={onBack} title="Notifications" />
        <div className="w2a1-a-segmented-control" role="tablist" aria-label="Notification filters">
          {NATIVE_NOTIFICATION_TABS.map((tab, index) => (
            <button
              aria-controls={panelId}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'is-active' : undefined}
              id={`${panelId}-tab-${tab.id}`}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => moveTabFocus(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`${panelId}-tab-${NATIVE_NOTIFICATION_TABS[activeIndex]?.id ?? 'all'}`}
          aria-live="polite"
          className="w2a1-a-detail-page__scroll"
          id={panelId}
          role="tabpanel"
          tabIndex={0}
        >
          {sections.map((section) => (
            <section
              className="w2a1-a-section"
              key={section.id}
              aria-labelledby={`w2a1-a-notification-${section.id}`}
            >
              <h2 id={`w2a1-a-notification-${section.id}`}>{section.label}</h2>
              <div className="w2a1-a-inset-list">
                {section.items.map((item) => (
                  <button
                    className={`w2a1-a-inset-row w2a1-a-notification-row ${
                      item.read ? 'is-read' : 'is-unread'
                    }`}
                    key={item.id}
                    onClick={() => onOpenNotification(item)}
                    type="button"
                  >
                    <span className="w2a1-a-notification-dot" aria-hidden="true" />
                    <span className="w2a1-a-row-content">
                      <span className="w2a1-a-notification-row__title">
                        <strong>{item.title}</strong>
                        <time>{item.timeLabel}</time>
                      </span>
                      <small>{item.reason}</small>
                      <em>Open {item.destinationLabel}</em>
                    </span>
                    <ChevronRight aria-hidden="true" className="w2a1-a-chevron" size={19} />
                  </button>
                ))}
              </div>
            </section>
          ))}

          {sections.length === 0 ? (
            <section className="w2a1-a-empty-state">
              <Bell aria-hidden="true" size={24} />
              <h2>No notifications in this view.</h2>
              <p>Choose another filter or return to Home.</p>
            </section>
          ) : null}
        </div>
      </main>
    </NativePageTransition>
  );
}
