<?php
/**
 * Demo audience for WordPress Playground: subscribers for Writer Subscribe,
 * tiers, members and gated posts for Writer Members, and a membership page.
 * Runs after demo-content.php (see blueprint.json). Each part is skipped
 * when its plugin isn't active, so the blog demo works on its own.
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/demo-helpers.php';

/**
 * Find a demo post by its title.
 */
function demo_post_by_title( $title ) {
    $found = get_posts( array(
        'title'       => $title,
        'post_type'   => 'post',
        'post_status' => 'any',
        'numberposts' => 1,
    ) );
    return $found ? $found[0] : null;
}

/**
 * Put the paywall before the Nth heading (so the teaser has real shape), or,
 * when the post has fewer headings, after the Nth paragraph.
 */
function demo_add_paywall( $content, $after = 1 ) {
    $marker = "<!-- wp:writer-members/paywall /-->\n\n";
    $parts  = preg_split( '/(?=<!-- wp:heading)/', $content );
    if ( count( $parts ) > $after ) {
        array_splice( $parts, $after, 0, $marker );
        return implode( '', $parts );
    }
    $parts = preg_split( '/(?=<!-- wp:paragraph -->)/', $content );
    $at    = min( count( $parts ) - 1, $after + 1 );
    array_splice( $parts, $at, 0, $marker );
    return implode( '', $parts );
}

/* ------------------------------------------------------------------------
 * Subscribers
 * --------------------------------------------------------------------- */

if ( function_exists( 'wsub_table' ) ) {
    global $wpdb;

    update_option( 'wsub_settings', array(
        'popup'         => true,
        'scroll'        => 60,
        'snooze_days'   => 14,
        'double_opt_in' => true,
        'heading'       => 'Get the next essay by email',
        'text'          => 'One piece every week or two, never more. No tracking, unsubscribe in one click.',
        'button'        => 'Subscribe',
        'consent'       => 'Email me new essays from The Slow Margin.',
    ) );

    $first_names = array( 'Ana', 'Mihai', 'Ioana', 'Radu', 'Elena', 'Andrei', 'Maria', 'Vlad', 'Simona', 'Tudor', 'Irina', 'Dan', 'Oana', 'Cristi', 'Laura', 'Bogdan', 'Alina', 'Sorin', 'Diana', 'Petre', 'Ruxandra', 'Matei', 'Carmen', 'Horia', 'Ileana', 'Nicu', 'Teodora', 'Florin', 'Luiza', 'Paul', 'Roxana', 'Victor', 'Corina', 'Sebastian', 'Mara', 'Ciprian', 'Daria', 'Emil', 'Adela', 'Liviu' );
    $domains     = array( 'example.com', 'example.org', 'example.net' );
    $popup_post  = demo_post_by_title( 'The case for writing badly first' );
    $sources     = array( 'inline', 'block', $popup_post ? 'popup:' . $popup_post->ID : 'inline' );
    $consent     = 'Email me new essays from The Slow Margin.';

    foreach ( $first_names as $i => $name ) {
        $email  = strtolower( $name ) . ( $i % 3 ? '' : '.' . ( $i + 7 ) ) . '@' . $domains[ $i % 3 ];
        $days   = 2 + ( $i * 7 ) % 180; // spread over six months
        $joined = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days} days -" . ( $i * 37 % 1440 ) . ' minutes' ) );

        // Most confirmed, a few still pending, a couple who left.
        if ( $i % 13 === 12 ) {
            $status = 'unsubscribed';
        } elseif ( $i % 8 === 7 ) {
            $status = 'pending';
        } else {
            $status = 'active';
        }

        $wpdb->insert( wsub_table(), array(
            'email'           => $email,
            'status'          => $status,
            'token'           => wp_generate_password( 32, false, false ),
            'token_at'        => $joined,
            'source'          => $sources[ $i % 3 ],
            'created_at'      => $joined,
            'confirmed_at'    => 'pending' === $status ? null : gmdate( 'Y-m-d H:i:s', strtotime( $joined ) + 600 + $i * 90 ),
            'unsubscribed_at' => 'unsubscribed' === $status ? gmdate( 'Y-m-d H:i:s', strtotime( $joined ) + 20 * DAY_IN_SECONDS ) : null,
            'consented_at'    => $i % 2 ? $joined : null,
            'consent_text'    => $i % 2 ? $consent : null,
        ) );
    }
}

/* ------------------------------------------------------------------------
 * Members
 * --------------------------------------------------------------------- */

if ( function_exists( 'wmem_set_user_tier' ) ) {
    // A membership page the upgrade box can point to. The demo has no Stripe
    // account, so the "payment link" is this page.
    $membership_id = wp_insert_post( array(
        'post_title'   => 'Become a member',
        'post_name'    => 'membership',
        'post_type'    => 'page',
        'post_status'  => 'publish',
        'post_author'  => 1,
        'post_content' =>
            demo_p( 'The Slow Margin is free to read and always will be. Members keep it that way, and get the pieces I write only for them: working notes, early drafts and the occasional letter.' ) .
            demo_h( 'Supporter' ) .
            demo_p( '<strong>€5 a month.</strong> Members-only posts, the full archive of working notes, and a quiet sense of having paid for something you actually read.' ) .
            demo_h( 'Founding' ) .
            demo_p( '<strong>€50 a year.</strong> Everything above, plus a letter from me twice a year and your name on the colophon, if you want it there.' ) .
            demo_p( '<em>This is a demo site: there is no checkout. In a real install each tier links to a Stripe Payment Link, and a webhook sets the member\'s tier when they pay.</em>' ) .
            demo_hr() .
            demo_h( 'Not ready to pay? Get the free emails' ) .
            "<!-- wp:writer-subscribe/form /-->\n\n",
    ) );
    $membership_url = $membership_id && ! is_wp_error( $membership_id ) ? get_permalink( $membership_id ) : home_url( '/' );
    if ( 0 !== strpos( $membership_url, 'https://' ) ) {
        $membership_url = ''; // The tier link must be https; leave it empty on plain-http hosts.
    }

    update_option( 'wmem_tiers', array(
        array( 'slug' => 'free', 'name' => 'Free', 'link' => '', 'plink' => '' ),
        array( 'slug' => 'supporter', 'name' => 'Supporter', 'link' => $membership_url, 'plink' => '' ),
        array( 'slug' => 'founding', 'name' => 'Founding', 'link' => $membership_url, 'plink' => '' ),
    ) );

    update_option( 'wmem_settings', array(
        'webhook_secret' => '',
        'delete_data'    => false,
        'heading'        => 'The rest is for %s members',
        'text'           => 'Membership keeps The Slow Margin free for everyone else, and opens the working notes.',
    ) );

    // Members: ordinary subscriber-role users with a tier.
    $members = array(
        array( 'login' => 'ana.popescu', 'name' => 'Ana Popescu', 'tier' => 'founding', 'joined' => '-140 days' ),
        array( 'login' => 'mihai.ionescu', 'name' => 'Mihai Ionescu', 'tier' => 'supporter', 'joined' => '-95 days' ),
        array( 'login' => 'ioana.radu', 'name' => 'Ioana Radu', 'tier' => 'supporter', 'joined' => '-60 days' ),
        array( 'login' => 'radu.stan', 'name' => 'Radu Stan', 'tier' => 'supporter', 'joined' => '-12 days' ),
        array( 'login' => 'elena.dumitru', 'name' => 'Elena Dumitru', 'tier' => 'free', 'joined' => '-30 days' ),
        array( 'login' => 'vlad.marinescu', 'name' => 'Vlad Marinescu', 'tier' => '', 'joined' => '-3 days' ),
    );
    foreach ( $members as $m ) {
        list( $first, $last ) = explode( ' ', $m['name'] );
        $user_id = wp_insert_user( array(
            'user_login'      => $m['login'],
            'user_email'      => $m['login'] . '@example.com',
            'user_pass'       => wp_generate_password( 24 ),
            'display_name'    => $m['name'],
            'first_name'      => $first,
            'last_name'       => $last,
            'role'            => 'subscriber',
            'user_registered' => gmdate( 'Y-m-d H:i:s', strtotime( $m['joined'] ) ),
        ) );
        if ( ! is_wp_error( $user_id ) && '' !== $m['tier'] ) {
            wmem_set_user_tier( $user_id, $m['tier'] );
        }
    }

    // Gate two existing essays part-way through.
    foreach ( array(
        'Notes on a walk along the Danube' => array( 'tier' => 'supporter', 'after' => 1 ),
        'Review: The Overstory'            => array( 'tier' => 'supporter', 'after' => 2 ),
    ) as $title => $gate ) {
        $post = demo_post_by_title( $title );
        if ( ! $post ) {
            continue;
        }
        wp_update_post( array(
            'ID'           => $post->ID,
            'post_content' => demo_add_paywall( $post->post_content, $gate['after'] ),
        ) );
        update_post_meta( $post->ID, 'wmem_tier', $gate['tier'] );
    }

    // Two posts written for members.
    $cats       = get_terms( array( 'taxonomy' => 'category', 'hide_empty' => false, 'fields' => 'id=>slug' ) );
    $notes_cat  = array_search( 'notes', $cats, true );
    $essays_cat = array_search( 'essays', $cats, true );

    $member_posts = array(
        array(
            'title'    => 'Working notes: the Danube piece, three drafts in',
            'cat'      => $notes_cat,
            'tags'     => array( 'process', 'working-notes' ),
            'tier'     => 'supporter',
            'date'     => '-6 days',
            'modified' => '-1 hours',
            'content'  =>
                demo_p( 'I promised members the messy middle, so here it is. The Danube essay is on its third draft and has lost its first two openings. What follows is what I cut, what I kept and why.' ) .
                "<!-- wp:writer-members/paywall /-->\n\n" .
                demo_h( 'Draft one: the travelogue' ) .
                demo_p( 'The first version began at the train station and walked, hour by hour, to the river. It was accurate and dead. Chronology is the easiest structure and the hardest to make interesting, because nothing in it has to earn its place.' ) .
                demo_h( 'Draft two: the argument' ) .
                demo_p( 'So I flipped it. Draft two opened with the claim, "walking is the only kind of thinking I trust," and marched through evidence. It read like a column. The river was in it, but the walk wasn\'t.' ) .
                demo_h( 'Draft three: the swan' ) .
                demo_p( 'The version you can read now opens with the swan because the swan is where my attention actually went. That is the whole lesson, and it took three drafts to learn it again: start where you looked, not where you planned to look.' ) .
                demo_quote( 'Start where you looked, not where you planned to look.' ),
        ),
        array(
            'title'    => 'A letter to founding members, spring',
            'cat'      => $essays_cat,
            'tags'     => array( 'letters' ),
            'tier'     => 'founding',
            'date'     => '-16 days',
            'modified' => '-3 days',
            'content'  =>
                demo_p( 'Dear founders, twice a year I write to you properly, by which I mean without a thesis. This is the spring letter.' ) .
                "<!-- wp:writer-members/paywall /-->\n\n" .
                demo_p( 'The site is a year old. It has eleven published pieces, which is fewer than I planned and more than I expected. Your support covered the hosting, a new chair and roughly four hundred coffees, which I will not itemise.' ) .
                demo_p( 'What I want to write next is a long piece about libraries, the physical kind, and the strange etiquette of silence in them. I will send you the first draft before anyone else sees it, as promised, and you may be as unkind as you like.' ) .
                demo_p( 'Thank you for paying for something you could have read for free. It changes how I write, and I think for the better.' ) .
                demo_p( '— Ilinca' ),
        ),
    );
    foreach ( $member_posts as $p ) {
        $date = gmdate( 'Y-m-d H:i:s', strtotime( $p['date'] ) );
        $id   = wp_insert_post( array(
            'post_title'    => $p['title'],
            'post_content'  => $p['content'],
            'post_status'   => 'publish',
            'post_author'   => 1,
            'post_date'     => get_date_from_gmt( $date ),
            'post_date_gmt' => $date,
            'post_category' => $p['cat'] ? array( (int) $p['cat'] ) : array(),
            'tags_input'    => $p['tags'],
        ), true );
        if ( is_wp_error( $id ) ) {
            continue;
        }
        update_post_meta( $id, 'wmem_tier', $p['tier'] );
        $modified = gmdate( 'Y-m-d H:i:s', strtotime( $p['modified'] ) );
        $GLOBALS['wpdb']->update(
            $GLOBALS['wpdb']->posts,
            array( 'post_modified_gmt' => $modified, 'post_modified' => get_date_from_gmt( $modified ) ),
            array( 'ID' => $id )
        );
        clean_post_cache( $id );
    }
}
