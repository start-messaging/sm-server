import { Matches } from 'class-validator';

/**
 * Set (or replace, while unverified) the user's mobile number. The regex is a
 * cheap first gate; libphonenumber is the authoritative validator and derives
 * the country server-side.
 */
export class SetMobileDto {
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'mobileE164 must be E.164 format, e.g. +919876543210',
  })
  mobileE164!: string;
}
