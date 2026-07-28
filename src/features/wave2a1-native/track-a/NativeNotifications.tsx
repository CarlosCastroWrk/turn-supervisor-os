import { Bell, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
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
  const sections = useMemo(
    () => groupNativeNotifications(items, activeTab),
    [activeTab, items],
  );

  return (
    <NativePageTransition>
      <main
        className="w2a1-a-root w2a1-a-detail-page"
        data-testid="wave2a1-native-notifications"
      >
        <NativePageHeader onBack={onBack} title="Notifications" />
        <div className="w2a1-a-segmented-control" role="tablist" aria-label="Notification filters">
          {NATIVE_NOTIFICATION_TABS.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'is-active' : undefined}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w2a1-a-detail-page__scroll" aria-live="polite">
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
