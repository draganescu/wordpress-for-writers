<?php
/**
 * Tiers, member tiers and access checks.
 *
 * Tiers are an ordered list in one option. Order is rank: the first tier is
 * the lowest (usually the free one), the last is the highest. A post's
 * `wmem_tier` meta is the lowest tier that may read it in full.
 */

defined( 'ABSPATH' ) || exit;

function wmem_default_tiers() {
    return array(
        array( 'slug' => 'free', 'name' => __( 'Free', 'writer-members' ), 'link' => '', 'plink' => '' ),
        array( 'slug' => 'supporter', 'name' => __( 'Supporter', 'writer-members' ), 'link' => '', 'plink' => '' ),
        array( 'slug' => 'founding', 'name' => __( 'Founding', 'writer-members' ), 'link' => '', 'plink' => '' ),
    );
}

/**
 * The ordered tier list: array of array( 'slug', 'name', 'link', 'plink' ).
 * 'link' is the Payment Link URL readers are sent to; 'plink' is its ID
 * (plink_…), which is how the webhook knows what was bought.
 */
function wmem_tiers() {
    $tiers = get_option( 'wmem_tiers', null );
    if ( ! is_array( $tiers ) ) {
        return wmem_default_tiers();
    }
    $tiers = array_filter( $tiers, function ( $t ) {
        return is_array( $t ) && '' !== (string) ( $t['slug'] ?? '' ) && '' !== (string) ( $t['name'] ?? '' );
    } );
    return array_values( array_map( function ( $t ) {
        return wp_parse_args( $t, array( 'link' => '', 'plink' => '' ) );
    }, $tiers ) );
}

function wmem_tier( $slug ) {
    foreach ( wmem_tiers() as $tier ) {
        if ( $tier['slug'] === $slug ) {
            return $tier;
        }
    }
    return null;
}

/**
 * Position of a tier in the list, or -1 when unknown.
 */
function wmem_tier_rank( $slug ) {
    foreach ( wmem_tiers() as $i => $tier ) {
        if ( $tier['slug'] === $slug ) {
            return $i;
        }
    }
    return -1;
}

/**
 * Sanitize the tier list from the admin form. Slugs are unique; rows without
 * a name are dropped.
 */
function wmem_sanitize_tiers( $rows ) {
    $out  = array();
    $seen = array();
    foreach ( (array) $rows as $row ) {
        if ( ! is_array( $row ) ) {
            continue;
        }
        $name = sanitize_text_field( $row['name'] ?? '' );
        if ( '' === $name || ! empty( $row['remove'] ) ) {
            continue;
        }
        $slug = sanitize_key( $row['slug'] ?? '' );
        if ( '' === $slug ) {
            $slug = sanitize_key( sanitize_title( $name ) );
        }
        // Slugs must be non-empty and not purely numeric, or the tier would vanish.
        if ( '' === $slug || ctype_digit( $slug ) ) {
            $slug = 'tier-' . $slug;
            $slug = 'tier-' === $slug ? 'tier-' . ( count( $out ) + 1 ) : $slug;
        }
        $base = $slug;
        $n    = 2;
        while ( isset( $seen[ $slug ] ) ) {
            $slug = $base . '-' . $n++;
        }
        $seen[ $slug ] = true;
        $link          = esc_url_raw( trim( $row['link'] ?? '' ), array( 'https' ) );
        $plink         = trim( (string) ( $row['plink'] ?? '' ) );
        $plink         = preg_match( '/^plink_[A-Za-z0-9]+$/', $plink ) ? $plink : '';
        $out[]         = array( 'slug' => $slug, 'name' => $name, 'link' => $link, 'plink' => $plink );
    }
    return $out;
}

/* ------------------------------------------------------------------------
 * Members
 * --------------------------------------------------------------------- */

function wmem_user_tier( $user_id ) {
    return $user_id ? (string) get_user_meta( $user_id, 'wmem_tier', true ) : '';
}

function wmem_set_user_tier( $user_id, $slug ) {
    $old = wmem_user_tier( $user_id );
    if ( '' === $slug ) {
        delete_user_meta( $user_id, 'wmem_tier' );
    } else {
        update_user_meta( $user_id, 'wmem_tier', $slug );
    }
    if ( $old !== $slug ) {
        /**
         * Fires when a member's tier changes. '' means no tier.
         */
        do_action( 'wmem_tier_changed', $user_id, $slug, $old );
    }
}

/**
 * The rank a user reads at. Logged-out readers have none (-1). A logged-in
 * user without a tier, or with a tier that no longer exists, reads at the
 * lowest tier.
 */
function wmem_user_rank( $user_id ) {
    if ( ! $user_id ) {
        return -1;
    }
    return max( 0, wmem_tier_rank( wmem_user_tier( $user_id ) ) );
}

/* ------------------------------------------------------------------------
 * Posts
 * --------------------------------------------------------------------- */

function wmem_post_types() {
    return (array) apply_filters( 'wmem_post_types', array( 'post' ) );
}

/**
 * The tier slug a post requires, or '' when it is public.
 */
function wmem_post_tier( $post ) {
    $post = get_post( $post );
    if ( ! $post || ! in_array( $post->post_type, wmem_post_types(), true ) ) {
        return '';
    }
    return (string) get_post_meta( $post->ID, 'wmem_tier', true );
}

function wmem_is_gated( $post ) {
    return '' !== wmem_post_tier( $post );
}

/**
 * Can this user read the whole post? People who can edit it always can. A
 * post set to a tier that has since been deleted stays closed to members,
 * so removing a tier never opens its posts.
 */
function wmem_can_read( $post, $user_id = null ) {
    $post = get_post( $post );
    if ( ! $post ) {
        return true;
    }
    $required = wmem_post_tier( $post );
    if ( '' === $required ) {
        return true;
    }
    $user_id = null === $user_id ? get_current_user_id() : (int) $user_id;
    if ( $user_id && user_can( $user_id, 'edit_post', $post->ID ) ) {
        return true;
    }
    $need = wmem_tier_rank( $required );
    if ( $need < 0 ) {
        return false;
    }
    $can = wmem_user_rank( $user_id ) >= $need;
    return (bool) apply_filters( 'wmem_can_read', $can, $post, $user_id );
}
