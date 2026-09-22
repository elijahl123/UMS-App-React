import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { describeTimeZone, getBrowserTimeZone, isValidTimeZone, normalizeTimeZone, timeZoneOptionGroups } from '@/lib/timeZones';

interface Props {
  value: string;
  onChange: (timeZone: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Hides the "use my current time zone" shortcut, e.g. inside a dense form. */
  hideDeviceShortcut?: boolean;
}

/**
 * Picks an IANA time zone from the list the runtime knows about, grouped by
 * region. Zones are never typed by hand: a typo silently sends times to the
 * wrong clock.
 */
function TimeZoneSelect({ value, onChange, id, className, disabled, hideDeviceShortcut }: Props) {
  const deviceTimeZone = getBrowserTimeZone();
  // The stored zone may not be one the runtime enumerates, so keep it selectable.
  const groups = useMemo(() => timeZoneOptionGroups([value, deviceTimeZone]), [value, deviceTimeZone]);
  const selected = isValidTimeZone(value) ? describeTimeZone(value) : null;
  const device = describeTimeZone(deviceTimeZone);
  const showDeviceShortcut =
    !hideDeviceShortcut && !disabled && normalizeTimeZone(value) !== normalizeTimeZone(deviceTimeZone);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Select value={isValidTimeZone(value) ? value : undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-label="Time zone">
          <SelectValue placeholder="Select a time zone">
            {selected ? `${selected.city} (${selected.offsetLabel})` : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {groups.map((group) => (
            <SelectGroup key={group.region}>
              <SelectLabel>{group.region}</SelectLabel>
              {group.zones.map((zone) => (
                <SelectItem key={zone.value} value={zone.value}>
                  {zone.city} ({zone.offsetLabel})
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {showDeviceShortcut && (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs font-normal"
          onClick={() => onChange(deviceTimeZone)}
        >
          Use my current time zone ({device.city}, {device.offsetLabel})
        </Button>
      )}
    </div>
  );
}

export default TimeZoneSelect;
