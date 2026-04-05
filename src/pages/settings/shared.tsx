/**
 * Settings shared — now a thin re-export from the design system.
 * All implementations live in src/design-system/index.tsx.
 * The T alias maps to DS so all settings tabs get theme-aware colors
 * that respond to the user's chosen accent color in Appearance settings.
 */
export {
  DS as T,
  Icons,
  SectionHeader,
  Card,
  CardRow,
  Toggle,
  FieldInput,
  SelectChip,
  StatusPill,
  PrimaryBtn,
  Spinner,
  Badge,
  Btn,
  ErrorBox,
} from '../../design-system'
