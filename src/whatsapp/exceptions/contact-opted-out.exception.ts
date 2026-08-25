import { AppException } from '../../common/exceptions/app.exception';
import { WA_ERR } from '../whatsapp-error-codes';

/**
 * Raised when an automated outbound targets a contact who has opted out.
 *
 * 422 rather than 400 so callers (campaign processor, sequences, triggers, the
 * flow runner) can tell a consent block apart from a validation failure.
 */
export class ContactOptedOutException extends AppException {
  constructor() {
    super(
      {
        code: WA_ERR.CONTACT_OPTED_OUT,
        message: 'This contact has opted out of automated messages.',
      },
      422,
    );
  }
}
