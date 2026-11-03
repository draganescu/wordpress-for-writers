<?php
/**
 * Demo blog for WordPress Playground (see blueprint.json) and the README screenshots.
 * Loaded by the blueprint after WordPress; never runs on its own.
 */

defined( 'ABSPATH' ) || exit;

function demo_p( $text ) {
    return "<!-- wp:paragraph -->\n<p>$text</p>\n<!-- /wp:paragraph -->\n\n";
}
function demo_h( $text, $level = 2 ) {
    $attrs = 2 === $level ? '' : ' {"level":' . $level . '}';
    return "<!-- wp:heading$attrs -->\n<h$level class=\"wp-block-heading\">$text</h$level>\n<!-- /wp:heading -->\n\n";
}
function demo_quote( $text, $cite = '' ) {
    $cite = $cite ? "<cite>$cite</cite>" : '';
    return "<!-- wp:quote -->\n<blockquote class=\"wp-block-quote\"><!-- wp:paragraph -->\n<p>$text</p>\n<!-- /wp:paragraph -->$cite</blockquote>\n<!-- /wp:quote -->\n\n";
}
function demo_list( $items, $ordered = false ) {
    $tag   = $ordered ? 'ol' : 'ul';
    $attrs = $ordered ? ' {"ordered":true}' : '';
    $li    = '';
    foreach ( $items as $item ) {
        $li .= "<!-- wp:list-item -->\n<li>$item</li>\n<!-- /wp:list-item -->\n";
    }
    return "<!-- wp:list$attrs -->\n<$tag class=\"wp-block-list\">$li</$tag>\n<!-- /wp:list -->\n\n";
}
function demo_hr() {
    return "<!-- wp:separator -->\n<hr class=\"wp-block-separator has-alpha-channel-opacity\"/>\n<!-- /wp:separator -->\n\n";
}

// Site identity.
update_option( 'blogname', 'The Slow Margin' );
update_option( 'blogdescription', 'Essays on writing, reading and paying attention' );
wp_update_user( array( 'ID' => 1, 'display_name' => 'Ilinca Marin', 'first_name' => 'Ilinca', 'last_name' => 'Marin' ) );

// Drop the default "Hello world!" post.
wp_delete_post( 1, true );

// Categories: rename the default one instead of leaving "Uncategorized".
wp_update_term( 1, 'category', array( 'name' => 'Notes', 'slug' => 'notes' ) );
$cats = array( 'Notes' => 1 );
foreach ( array( 'Essays', 'Craft', 'Reading', 'Travel' ) as $name ) {
    $term          = term_exists( $name, 'category' ) ?: wp_insert_term( $name, 'category' );
    $cats[ $name ] = (int) $term['term_id'];
}

$posts = array(
    array(
        'title'    => 'The case for writing badly first',
        'cat'      => 'Craft',
        'tags'     => array( 'craft', 'process' ),
        'status'   => 'publish',
        'date'     => '-3 days',
        'modified' => '-20 minutes',
        'content'  =>
            demo_p( 'Every draft I have ever finished started as something I was slightly embarrassed by. Not "rough" in the charming, pencil-sketch sense. Bad. Repetitive, overwritten, wandering off into side streets and forgetting to come back.' ) .
            demo_p( 'For years I treated that as a problem to be solved before I was allowed to begin. I would wait for the first sentence to arrive fully formed, then the second, and by lunchtime I had a polished paragraph and no idea where the piece was going. The <strong>quality of the opening</strong> was holding the rest of the essay hostage.' ) .
            demo_h( 'Permission is a technique' ) .
            demo_p( 'What changed was not discipline but permission. I started writing first drafts in a file called <code>scratch</code>, a name that promised nobody would ever read it, and I stopped rereading anything until I reached the end.' ) .
            demo_quote( 'The first draft is just you telling yourself the story.', 'Terry Pratchett' ) .
            demo_p( 'A bad first draft is a map drawn from memory. It is wrong in a hundred places, but it shows you the shape of the country, and you cannot revise a country you have not yet walked across.' ) .
            demo_h( 'What I do now' ) .
            demo_list( array(
                'Write the whole thing in one or two sittings, without stopping to fix sentences.',
                'Leave notes to future me in square brackets instead of researching mid-draft.',
                'Let it rest for a day, then read it once, out loud, before touching a word.',
                'Revise from the biggest problems down: structure first, sentences last.',
            ), true ) .
            demo_p( 'The draft is still bad. That was never the point. The point is that now it exists.' ),
    ),
    array(
        'title'    => 'Notes on a walk along the Danube',
        'cat'      => 'Travel',
        'tags'     => array( 'walking', 'cities' ),
        'status'   => 'publish',
        'date'     => '-9 days',
        'modified' => '-2 hours',
        'content'  =>
            demo_p( 'I started at the bridge just after seven, when the river was the colour of weak tea and the only other people out were runners and a man feeding pigeons with great seriousness.' ) .
            demo_p( 'Walking a river is a good way to see a city sideways. You get the backs of buildings, the loading docks, the cafés that only locals know because they face the water instead of the street.' ) .
            demo_h( 'Things I wrote down' ) .
            demo_list( array(
                'A barge called <em>Patience</em>, moving at exactly walking pace for two kilometres.',
                'Three anglers, none of whom caught anything, all of whom looked content.',
                'A bench with a small brass plaque: <em>she liked it here</em>.',
            ) ) .
            demo_p( 'By noon my feet hurt and I had filled half a notebook. I am not sure any of it will become an essay. I am not sure it needs to.' ),
    ),
    array(
        'title'    => 'Against productivity theatre',
        'cat'      => 'Essays',
        'tags'     => array( 'work', 'attention' ),
        'status'   => 'draft',
        'date'     => '-1 days',
        'modified' => '-5 hours',
        'content'  =>
            demo_p( 'There is a kind of work that looks like work. Colour-coded calendars, a new app every quarter, a morning routine with eleven steps and a name. I have done all of it. Most of it was a way of feeling busy while avoiding the one thing I actually needed to do, which was sit still and think.' ) .
            demo_p( '[expand: the difference between being occupied and being engaged]' ) .
            demo_p( 'The most productive days I can remember had almost nothing in them. A blank morning, a walk, a problem I could not stop turning over.' ),
    ),
    array(
        'title'    => 'Reading list: winter',
        'cat'      => 'Reading',
        'tags'     => array( 'books' ),
        'status'   => 'publish',
        'date'     => '-14 days',
        'modified' => '-1 days',
        'content'  =>
            demo_p( 'Short days are for long books. Here is what is on the nightstand this season, in roughly the order I expect to abandon them.' ) .
            demo_list( array(
                '<strong>The Rings of Saturn</strong> by W. G. Sebald, a walk that turns into a meditation on decay.',
                '<strong>Bluets</strong> by Maggie Nelson, 240 numbered propositions about the colour blue.',
                '<strong>Pilgrim at Tinker Creek</strong> by Annie Dillard, for when I need to be reminded to look.',
                '<strong>Bird by Bird</strong> by Anne Lamott, reread every winter, never regretted.',
            ) ) .
            demo_p( 'Suggestions welcome, especially anything slow.' ),
    ),
    array(
        'title'    => 'Why I left the newsletter treadmill',
        'cat'      => 'Essays',
        'tags'     => array( 'publishing', 'blogging' ),
        'status'   => 'publish',
        'date'     => '-21 days',
        'modified' => '-2 days',
        'content'  =>
            demo_p( 'For three years I sent a newsletter every Sunday. It grew, slowly and then quickly, and somewhere around the second year I noticed I had stopped writing essays and started producing issues.' ) .
            demo_p( 'An issue has a deadline and a word count and an open rate. An essay has none of those things. It is finished when it is finished, and sometimes that means it is never finished at all.' ) .
            demo_h( 'Back to the blog' ) .
            demo_p( 'So I came back here, to a plain website I own, where a post can sit as a draft for six months without anybody unsubscribing. It turns out that freedom was the thing I had been paying for all along.' ),
    ),
    array(
        'title'    => 'Small rooms, big sentences',
        'cat'      => 'Craft',
        'tags'     => array( 'craft', 'style' ),
        'status'   => 'publish',
        'date'     => '-30 days',
        'modified' => '-4 days',
        'content'  =>
            demo_p( 'A long sentence needs somewhere to land. Put it after three short ones and it feels like a breath let out. Put it after three more long ones and the reader drowns.' ) .
            demo_quote( 'Vary the length of your sentences, and you vary the music.' ) .
            demo_p( 'I keep a note of sentences I love, not for what they say but for how they move. Rereading them is like doing scales before practice.' ),
    ),
    array(
        'title'    => 'On revising',
        'cat'      => 'Craft',
        'tags'     => array( 'craft', 'editing' ),
        'status'   => 'draft',
        'date'     => '-2 days',
        'modified' => '-6 days',
        'content'  =>
            demo_p( 'Revision is where the essay finds out what it is about. The first draft is a question; revision is the answer, and the answer is almost never the one I expected.' ) .
            demo_p( 'Notes for this one: cut the opening anecdote, start with the argument, bring the anecdote back at the end as evidence.' ),
    ),
    array(
        'title'    => 'Interview questions for M.',
        'cat'      => 'Notes',
        'tags'     => array( 'interviews' ),
        'status'   => 'draft',
        'date'     => '-3 days',
        'modified' => '-7 days',
        'content'  =>
            demo_list( array(
                'When did you first think of yourself as a writer, rather than someone who writes?',
                'What does a good working day look like now, and what did it look like ten years ago?',
                'Which of your books do you reread, and which can you not bear to open?',
                'What advice do you wish you had ignored?',
            ), true ),
    ),
    array(
        'title'    => 'The quiet joy of a paper notebook',
        'cat'      => 'Essays',
        'tags'     => array( 'tools', 'attention' ),
        'status'   => 'future',
        'date'     => '+5 days',
        'modified' => '-8 days',
        'content'  =>
            demo_p( 'A notebook has no notifications. It does not sync, it does not suggest, and it will never ask me to upgrade. It just waits, which is exactly what I need from it.' ) .
            demo_p( 'I carry a small one in my coat pocket. Most of what goes in there is useless, which is precisely why it works.' ),
    ),
    array(
        'title'    => 'Review: The Overstory',
        'cat'      => 'Reading',
        'tags'     => array( 'books', 'reviews' ),
        'status'   => 'publish',
        'date'     => '-45 days',
        'modified' => '-10 days',
        'content'  =>
            demo_p( 'A novel in which the main characters are trees, and the humans are the weather passing through. It is long, it is earnest, and it changed the way I walk through a park.' ) .
            demo_p( 'It is not a perfect book. Some of the human stories feel like they exist mostly to carry the argument. But the argument is worth carrying.' ),
    ),
    array(
        'title'    => 'Half-formed: ideas for spring',
        'cat'      => 'Notes',
        'tags'     => array( 'ideas' ),
        'status'   => 'draft',
        'date'     => '-4 days',
        'modified' => '-12 days',
        'content'  =>
            demo_list( array(
                'An essay about the people who sit on the same bench every morning.',
                'A series on the handwriting of writers I admire.',
                'What a blog can do that a feed cannot.',
                'Learning to draw, badly, in public.',
            ) ),
    ),
    array(
        'title'    => 'What a year of morning pages taught me',
        'cat'      => 'Essays',
        'tags'     => array( 'habits', 'process' ),
        'status'   => 'publish',
        'date'     => '-60 days',
        'modified' => '-15 days',
        'content'  =>
            demo_p( 'Three pages, longhand, every morning, before coffee and before email. I kept it up for a year, mostly out of stubbornness.' ) .
            demo_p( 'Nothing I wrote in those pages was any good. That turned out to be the gift: a place where nothing had to be good, which made everything else easier to start.' ),
    ),
);

foreach ( $posts as $post ) {
    $date = gmdate( 'Y-m-d H:i:s', strtotime( $post['date'] ) );
    $id   = wp_insert_post( array(
        'post_title'    => $post['title'],
        'post_content'  => $post['content'],
        'post_status'   => $post['status'],
        'post_author'   => 1,
        'post_date'     => get_date_from_gmt( $date ),
        'post_date_gmt' => $date,
        'post_category' => array( $cats[ $post['cat'] ] ),
        'tags_input'    => $post['tags'],
    ), true );
    if ( is_wp_error( $id ) ) {
        continue;
    }
    // The list is sorted by last-modified; set it explicitly for a natural order.
    $modified = gmdate( 'Y-m-d H:i:s', strtotime( $post['modified'] ) );
    $GLOBALS['wpdb']->update(
        $GLOBALS['wpdb']->posts,
        array( 'post_modified_gmt' => $modified, 'post_modified' => get_date_from_gmt( $modified ) ),
        array( 'ID' => $id )
    );
    clean_post_cache( $id );
}
