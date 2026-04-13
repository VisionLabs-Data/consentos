import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { trackConfigChange } from '../services/analytics';
import type { BannerConfig, ButtonConfig } from '../types/api';
import { Button } from './ui/button.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { Alert } from './ui/alert.tsx';
import { Select } from './ui/select.tsx';
import { TabGroup } from './ui/tab-group.tsx';
import BannerPreview from './BannerPreview';

type DisplayMode = 'bottom_banner' | 'top_banner' | 'overlay' | 'corner_popup';
type CornerPosition = 'left' | 'right';
type Viewport = 'desktop' | 'mobile';

const DISPLAY_MODES: { value: DisplayMode; label: string }[] = [
  { value: 'bottom_banner', label: 'Bottom banner' },
  { value: 'top_banner', label: 'Top banner' },
  { value: 'overlay', label: 'Overlay (modal)' },
  { value: 'corner_popup', label: 'Corner popup' },
];

const FONT_OPTIONS = [
  { value: 'system-ui', label: 'System default' },
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: "'Lato', sans-serif", label: 'Lato' },
  { value: "Georgia, serif", label: 'Georgia (serif)' },
];

interface Props {
  /** Unique key for cache invalidation (e.g. ['sites', siteId, 'config'] or ['org-config']) */
  configQueryKey: string[];
  /** The config object containing banner_config */
  config: { banner_config: BannerConfig | null } | null;
  /** Function to save the updated banner config */
  onSave: (body: { banner_config: BannerConfig }) => Promise<unknown>;
  /** Optional domain for the preview iframe */
  siteDomain?: string | null;
}

interface Defaults {
  primaryColour: string;
  backgroundColour: string;
  textColour: string;
  buttonStyle: 'filled' | 'outline';
  fontFamily: string;
  borderRadius: number;
  showRejectAll: boolean;
  showManagePreferences: boolean;
  showCloseButton: boolean;
  showLogo: boolean;
  logoUrl: string;
  showCookieCount: boolean;
  displayMode: DisplayMode;
  cornerPosition: CornerPosition;
  acceptButton: ButtonConfig;
  rejectButton: ButtonConfig;
  manageButton: ButtonConfig;
}

function getDefaults(config: { banner_config: BannerConfig | null } | null): Defaults {
  const bc = config?.banner_config;
  return {
    primaryColour: bc?.primaryColour ?? '#2563eb',
    backgroundColour: bc?.backgroundColour ?? '#ffffff',
    textColour: bc?.textColour ?? '#1a1a2e',
    buttonStyle: bc?.buttonStyle ?? 'filled',
    fontFamily: bc?.fontFamily ?? 'system-ui',
    borderRadius: bc?.borderRadius ?? 6,
    showRejectAll: bc?.showRejectAll ?? true,
    showManagePreferences: bc?.showManagePreferences ?? true,
    showCloseButton: bc?.showCloseButton ?? false,
    showLogo: bc?.showLogo ?? false,
    logoUrl: bc?.logoUrl ?? '',
    showCookieCount: bc?.showCookieCount ?? false,
    displayMode: (bc?.displayMode as DisplayMode) ?? 'bottom_banner',
    cornerPosition: (bc?.cornerPosition as CornerPosition) ?? 'right',
    acceptButton: bc?.acceptButton ?? {},
    rejectButton: bc?.rejectButton ?? {},
    manageButton: bc?.manageButton ?? {},
  };
}

export default function BannerBuilderTab({ configQueryKey, config, onSave, siteDomain }: Props) {
  const queryClient = useQueryClient();
  const defaults = useMemo(() => getDefaults(config), [config]);

  // Theme state
  const [primaryColour, setPrimaryColour] = useState(defaults.primaryColour);
  const [backgroundColour, setBackgroundColour] = useState(defaults.backgroundColour);
  const [textColour, setTextColour] = useState(defaults.textColour);
  const [buttonStyle, setButtonStyle] = useState(defaults.buttonStyle);
  const [fontFamily, setFontFamily] = useState(defaults.fontFamily);
  const [borderRadius, setBorderRadius] = useState(defaults.borderRadius);

  // Layout state
  const [showRejectAll, setShowRejectAll] = useState(defaults.showRejectAll);
  const [showManagePreferences, setShowManagePreferences] = useState(defaults.showManagePreferences);
  const [showCloseButton, setShowCloseButton] = useState(defaults.showCloseButton);
  const [showLogo, setShowLogo] = useState(defaults.showLogo);
  const [logoUrl, setLogoUrl] = useState(defaults.logoUrl);
  const [showCookieCount, setShowCookieCount] = useState(defaults.showCookieCount);

  // Display mode and viewport
  const [displayMode, setDisplayMode] = useState<DisplayMode>(defaults.displayMode);
  const [cornerPosition, setCornerPosition] = useState<CornerPosition>(defaults.cornerPosition);
  const [viewport, setViewport] = useState<Viewport>('desktop');

  // Per-button styling
  const [acceptButton, setAcceptButton] = useState<ButtonConfig>(defaults.acceptButton);
  const [rejectButton, setRejectButton] = useState<ButtonConfig>(defaults.rejectButton);
  const [manageButton, setManageButton] = useState<ButtonConfig>(defaults.manageButton);

  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: { banner_config: BannerConfig }) => onSave(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configQueryKey });
      trackConfigChange('banner_config');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const bannerConfig: BannerConfig = useMemo(
    () => ({
      primaryColour,
      backgroundColour,
      textColour,
      buttonStyle,
      fontFamily,
      borderRadius,
      showRejectAll,
      showManagePreferences,
      showCloseButton,
      showLogo,
      logoUrl: logoUrl || undefined,
      showCookieCount,
      cornerPosition,
      acceptButton: Object.keys(acceptButton).length > 0 ? acceptButton : undefined,
      rejectButton: Object.keys(rejectButton).length > 0 ? rejectButton : undefined,
      manageButton: Object.keys(manageButton).length > 0 ? manageButton : undefined,
    }),
    [
      primaryColour, backgroundColour, textColour, buttonStyle, fontFamily,
      borderRadius, showRejectAll, showManagePreferences, showCloseButton,
      showLogo, logoUrl, showCookieCount, cornerPosition,
      acceptButton, rejectButton, manageButton,
    ],
  );

  const handleSave = useCallback(() => {
    mutation.mutate({
      banner_config: { ...bannerConfig, displayMode },
    });
  }, [mutation, bannerConfig, displayMode]);

  return (
    <div className="flex gap-6" data-testid="banner-builder">
      {/* Left panel — controls */}
      <div className="w-80 shrink-0 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* Display mode */}
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">Display mode</h3>
            <div className="grid grid-cols-2 gap-2">
              {DISPLAY_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setDisplayMode(mode.value)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                    displayMode === mode.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-mist text-text-secondary hover:bg-mist/80'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Corner position — only shown for corner_popup */}
            {displayMode === 'corner_popup' && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-text-secondary">Position</label>
                <div className="flex gap-2">
                  {(['left', 'right'] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setCornerPosition(pos)}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        cornerPosition === pos
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-mist text-text-secondary hover:bg-mist/80'
                      }`}
                    >
                      {pos.charAt(0).toUpperCase() + pos.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">Theme</h3>
            <div className="space-y-3">
              <ColourField label="Primary colour" value={primaryColour} onChange={setPrimaryColour} />
              <ColourField label="Background" value={backgroundColour} onChange={setBackgroundColour} />
              <ColourField label="Text colour" value={textColour} onChange={setTextColour} />

              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Font</label>
                <Select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  Border radius ({borderRadius}px)
                </label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Default button style</label>
                <div className="flex gap-2">
                  {(['filled', 'outline'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setButtonStyle(style)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        buttonStyle === style
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-mist text-text-secondary hover:bg-mist/80'
                      }`}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Button styling */}
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">Button styling</h3>
            <p className="mb-3 text-xs text-text-secondary">
              Override colours per button, or leave blank to use the theme defaults.
            </p>
            <div className="space-y-4">
              <ButtonStyleEditor
                label="Accept button"
                config={acceptButton}
                onChange={setAcceptButton}
                defaults={{ backgroundColour: primaryColour, textColour: '#ffffff', style: buttonStyle }}
              />
              {showRejectAll && (
                <ButtonStyleEditor
                  label="Reject button"
                  config={rejectButton}
                  onChange={setRejectButton}
                  defaults={{ backgroundColour: 'transparent', textColour, style: 'outline' }}
                />
              )}
              {showManagePreferences && (
                <ButtonStyleEditor
                  label="Manage preferences"
                  config={manageButton}
                  onChange={setManageButton}
                  defaults={{ backgroundColour: 'transparent', textColour, style: 'outline' }}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Layout */}
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 font-heading text-sm font-semibold text-foreground">Layout</h3>
            <div className="space-y-2.5">
              <ToggleField label="Show 'Reject all' button" checked={showRejectAll} onChange={setShowRejectAll} />
              <ToggleField label="Show 'Manage preferences'" checked={showManagePreferences} onChange={setShowManagePreferences} />
              <ToggleField label="Show close button" checked={showCloseButton} onChange={setShowCloseButton} />
              <ToggleField label="Show cookie count" checked={showCookieCount} onChange={setShowCookieCount} />
              <ToggleField label="Show logo" checked={showLogo} onChange={setShowLogo} />
              {showLogo && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Logo URL</label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.svg"
                    className="w-full rounded-lg border border-border px-3 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="w-full"
          >
            {mutation.isPending ? 'Saving...' : 'Save banner'}
          </Button>
        </div>
        {saved && <Alert variant="success">Saved successfully</Alert>}
        {mutation.isError && <Alert variant="error">Failed to save. Please try again.</Alert>}
      </div>

      {/* Right panel — preview */}
      <div className="flex-1">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">Live preview</h3>
          <TabGroup
            options={[
              { value: 'desktop', label: 'Desktop' },
              { value: 'mobile', label: 'Mobile' },
            ]}
            value={viewport}
            onChange={(v) => setViewport(v as Viewport)}
          />
        </div>

        <BannerPreview
          bannerConfig={bannerConfig}
          displayMode={displayMode}
          cornerPosition={cornerPosition}
          viewport={viewport}
          privacyPolicyUrl={(config as Record<string, unknown>)?.privacy_policy_url as string ?? null}
          siteUrl={siteDomain}
        />
      </div>
    </div>
  );
}

/* ── Helper components ─────────────────────────────────────────────── */

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-border"
      />
      <div className="flex-1">
        <label className="block text-xs font-medium text-text-secondary">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-border px-2 py-0.5 text-xs font-mono text-text-secondary"
        />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border text-copper"
      />
    </label>
  );
}

function ButtonStyleEditor({
  label,
  config,
  onChange,
  defaults,
}: {
  label: string;
  config: ButtonConfig;
  onChange: (c: ButtonConfig) => void;
  defaults: { backgroundColour: string; textColour: string; style: string };
}) {
  const update = (patch: Partial<ButtonConfig>) => onChange({ ...config, ...patch });
  const bgColour = config.backgroundColour ?? defaults.backgroundColour;
  const txtColour = config.textColour ?? defaults.textColour;
  const style = config.style ?? defaults.style;

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-medium text-text-secondary">{label}</p>
      <div className="space-y-2">
        <div className="flex gap-2">
          {(['filled', 'outline', 'text'] as const).map((s) => (
            <button
              key={s}
              onClick={() => update({ style: s })}
              className={`rounded px-2 py-1 text-xs font-medium transition ${
                style === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-mist text-text-secondary hover:bg-mist/80'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={bgColour}
            onChange={(e) => update({ backgroundColour: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border border-border"
          />
          <span className="text-xs text-text-secondary">Background</span>
          <input
            type="color"
            value={txtColour}
            onChange={(e) => update({ textColour: e.target.value })}
            className="ml-auto h-6 w-6 cursor-pointer rounded border border-border"
          />
          <span className="text-xs text-text-secondary">Text</span>
        </div>
      </div>
    </div>
  );
}
